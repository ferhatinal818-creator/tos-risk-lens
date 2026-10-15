import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocument, AnalysisError, DISCLAIMER_TR } from '../src/core/pipeline.js';
import { normalizeWithMap } from '../src/core/normalize.js';
import { detectLegalPage } from '../src/core/detect.js';
import { runRules } from '../src/core/rules.js';
import { captureFixture, quoteFrom, finding, modelJson } from './helpers.js';

const clean = captureFixture('tos-clean.html');
const T = clean.text;
const goodFindings = () => [
  finding('auto_renewal', quoteFrom(T, 'Your paid subscription renews automatically', 170)),
  finding('arbitration_class_waiver', quoteFrom(T, 'Any dispute arising out of or relating to the Service will be resolved exclusively through binding arbitration', 220)),
  finding('data_sharing', quoteFrom(T, 'We may share your personal information with advertising partners', 130)),
  finding('content_license', quoteFrom(T, 'a worldwide, perpetual, irrevocable, royalty-free, sublicensable license', 120), { severity: 'high' }),
];

test('mutlu yol: doğrulanmış bulgular, deterministik skor, dezavantaj metni ve ofsetler', async () => {
  const report = await analyzeDocument({ capture: clean, llm: async () => modelJson(goodFindings()), model: 'mock' });
  assert.equal(report.findings.length, 4);
  assert.ok(report.risk.score >= 50, `skor ${report.risk.score}`);
  assert.equal(report.disclaimer_tr, DISCLAIMER_TR);
  assert.match(report.disclaimer_tr, /hukuki tavsiye vermez/);
  // her bulgunun alıntısı metinde (normalize) bulunuyor ve ofsetler aynı aralığı gösteriyor
  for (const f of report.findings) {
    assert.ok(normalizeWithMap(T).norm.includes(normalizeWithMap(f.quote).norm));
    assert.ok(normalizeWithMap(T.slice(f.start, f.end)).norm.includes(normalizeWithMap(f.quote).norm.split(' ').slice(0, 4).join(' ')));
  }
  assert.equal(report.security.integrity, 'clean');
  // aynı girdi, aynı skor
  const again = await analyzeDocument({ capture: clean, llm: async () => modelJson(goodFindings()), model: 'mock' });
  assert.equal(again.risk.score, report.risk.score);
});

test('onarım döngüsü: bozuk alıntı ikinci denemede düzeltilirse kabul edilir (en fazla 1 onarım)', async () => {
  const good = goodFindings()[0];
  const broken = { ...good, quote: good.quote.replace('renews automatically', 'is renewed on its own') };
  let calls = 0;
  const llm = async (messages) => {
    calls++;
    if (calls === 1) return modelJson([broken]);
    assert.ok(messages.some((m) => m.role === 'user' && /rejected/i.test(m.content)), 'onarım isteği doğrulayıcı geri bildirimini içermeli');
    return modelJson([good]);
  };
  const report = await analyzeDocument({ capture: clean, llm, model: 'mock' });
  assert.equal(calls, 2);
  assert.equal(report.findings.length, 1);
  assert.equal(report.rejected_claims.length, 0);
});

test('kalıcı halüsinasyon: onarımdan sonra da bulunamayan alıntı REDDEDİLİR ve raporda şeffaf listelenir', async () => {
  const fake = finding('no_refund', 'Refunds are available within 30 days of purchase, no questions asked, in all cases.');
  const report = await analyzeDocument({ capture: clean, llm: async () => modelJson([...goodFindings(), fake]), model: 'mock' });
  assert.equal(report.findings.length, 4);
  assert.equal(report.rejected_claims.length, 1);
  assert.ok(report.uncertainties.some((u) => u.topic === 'Reddedilen iddialar'));
});

test('LLM hatası: tek parça başarısızsa AnalysisError; çok parçalıysa kısmi sonuç + belirsizlik', async () => {
  await assert.rejects(analyzeDocument({ capture: clean, llm: async () => { throw new Error('HTTP 500'); }, model: 'mock' }), (e) => e instanceof AnalysisError);
  const long = { text: Array.from({ length: 5 }, () => T).join('\n\n'), hidden: [] };
  let n = 0;
  const llm = async () => { n++; if (n === 2) throw new Error('timeout'); return modelJson(goodFindings().slice(0, 1)); };
  const report = await analyzeDocument({ capture: long, llm, model: 'mock', options: { chunkSize: 7000, concurrency: 1 } });
  assert.ok(report.meta.chunks > 1);
  assert.equal(report.meta.failed_chunks, 1);
  assert.ok(report.uncertainties.some((u) => u.topic === 'Eksik analiz'));
});

test('çok kısa metin: analiz yapılmaz', async () => {
  await assert.rejects(analyzeDocument({ capture: { text: 'Merhaba dünya', hidden: [] }, llm: async () => modelJson([]), model: 'mock' }), (e) => e.code === 'too_short');
});

test('kural motoru: temiz fixture üzerinde beklenen kategorileri yakalar', () => {
  const cats = new Set(runRules(T).map((h) => h.category));
  for (const c of ['auto_renewal', 'no_refund', 'arbitration_class_waiver', 'data_sharing', 'content_license', 'ai_training_use', 'account_termination', 'unilateral_change', 'liability_limitation', 'indemnification', 'jurisdiction', 'consent_by_use']) {
    assert.ok(cats.has(c), `kural eksik: ${c}`);
  }
});

test('detect: ToS sayfası algılanır, sıradan sayfa algılanmaz', () => {
  const d = detectLegalPage({ url: 'https://lumenly.example/terms', title: 'Lumenly Terms of Service', headings: 'Lumenly Terms of Service', text: T.repeat(2) });
  assert.equal(d.detected, true);
  const blog = detectLegalPage({ url: 'https://example.com/blog/cats', title: 'Ten cats', headings: 'Ten cats', text: 'cats '.repeat(1200) });
  assert.equal(blog.detected, false);
  const short = detectLegalPage({ url: 'https://example.com/terms', title: 'Terms', headings: 'Terms', text: 'Terms apply.' });
  assert.equal(short.detected, false);
});
