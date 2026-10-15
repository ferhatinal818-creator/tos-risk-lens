// Uçtan uca analiz hattı:  capture -> sanitize -> chunk -> LLM -> DOĞRULA -> (onar) -> birleştir -> kural çapraz kontrolü -> skor
import { sanitizeCapture } from './injection.js';
import { prepareSource } from './normalize.js';
import { chunkText } from './chunk.js';
import { buildMessages, repairMessages, randomNonce } from './prompt.js';
import { validateModelOutput, dedupeFindings } from './validate.js';
import { runRules } from './rules.js';
import { computeScore, SCORE_K } from './score.js';
import { CATEGORIES, WIRE_SCHEMA, DOC_TYPE_LABEL_TR, SEVERITY_LABEL_TR } from './schema.js';

export const DISCLAIMER_TR =
  'Bu uygulama hukuki tavsiye vermez. Rapor, otomatik bir metin analizidir; yanılabilir ve bir avukatın görüşünün yerini tutmaz.';

export class AnalysisError extends Error {
  constructor(code, message) { super(message); this.name = 'AnalysisError'; this.code = code; }
}

const DEFAULTS = { maxChars: 150000, chunkSize: 12000, overlap: 600, concurrency: 2, maxRepairs: 1, minChars: 400 };

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * @param {object} p
 * @param {{url?:string,title?:string,text:string,hidden?:object[]}} p.capture
 * @param {(messages:object[], o:{schema:object})=>Promise<string>} p.llm
 */
export async function analyzeDocument({ capture, llm, model = 'unknown', onProgress = () => {}, options = {}, now = () => new Date() }) {
  const opt = { ...DEFAULTS, ...options };
  const t0 = Date.now();

  onProgress({ stage: 'sanitize', message: 'Metin temizleniyor ve güvenlik taraması yapılıyor' });
  const san = sanitizeCapture(capture);
  let text = san.cleanText;
  let truncated = false;
  if (text.length > opt.maxChars) {
    const cut = text.lastIndexOf('\n', opt.maxChars);
    text = text.slice(0, cut > opt.maxChars * 0.8 ? cut : opt.maxChars);
    truncated = true;
  }
  if (text.length < opt.minChars) throw new AnalysisError('too_short', 'Sayfada analiz edilecek kadar metin bulunamadı.');

  const src = prepareSource(text);
  const chunks = chunkText(text, { size: opt.chunkSize, overlap: opt.overlap });
  const nonce = randomNonce();
  let done = 0;
  const failures = [];
  const docTypes = [];
  const modelUncertainties = [];
  let rejectedAll = [];
  let acceptedAll = [];

  async function runChunk(chunk) {
    let messages = buildMessages(chunk.text, nonce);
    let accepted = [];
    let last = null;
    let raw = '';
    for (let attempt = 0; attempt <= opt.maxRepairs; attempt++) {
      raw = await llm(messages, { schema: WIRE_SCHEMA });
      last = validateModelOutput(raw, src);
      if (last.ok) accepted = accepted.concat(last.accepted);
      const problems = !last.ok
        ? last.errors.slice(0, 5).map((e) => `${e.path || ''} ${e.code}`.trim())
        : last.rejected.filter((r) => r.reasons.some((x) => x.startsWith('quote:'))).slice(0, 6)
            .map((r) => `quote not found verbatim: "${clip(r.finding.quote, 140)}" (${r.reasons.join(',')})`);
      if (!problems.length || attempt === opt.maxRepairs) break;
      messages = repairMessages(buildMessages(chunk.text, nonce), raw, problems);
    }
    if (!last.ok) throw new AnalysisError('invalid_output', `Model çıktısı şemaya uymadı (${last.errors.slice(0, 3).map((e) => e.code).join(', ')})`);
    docTypes.push(last.documentType);
    modelUncertainties.push(...last.uncertainties);
    rejectedAll = rejectedAll.concat(last.rejected);
    acceptedAll = acceptedAll.concat(accepted);
    // onarımda kurtarılanlar rejected listesinden düşsün (aynı kategori + kesişen aralık)
  }

  onProgress({ stage: 'llm', message: `Model çalışıyor (0/${chunks.length})`, done: 0, total: chunks.length });
  await pool(chunks, opt.concurrency, async (chunk) => {
    try { await runChunk(chunk); }
    catch (e) { failures.push({ chunk: chunk.index, error: e.message, code: e.code || e.name }); }
    done++;
    onProgress({ stage: 'llm', message: `Model çalışıyor (${done}/${chunks.length})`, done, total: chunks.length });
  });
  if (failures.length === chunks.length) {
    throw new AnalysisError(failures[0].code === 'invalid_output' ? 'invalid_output' : 'llm_failed', `Hiçbir bölüm analiz edilemedi: ${failures[0].error}`);
  }

  onProgress({ stage: 'verify', message: 'Alıntılar doğrulanıyor, skor hesaplanıyor' });
  const findings = dedupeFindings(acceptedAll);
  // kurtarılmış (onarımla geçerli hale gelmiş) iddiaları "reddedilen" listesinden çıkar
  const rejected = rejectedAll.filter((r) => !findings.some((f) => f.category === r.finding.category && locateOverlap(r.finding.quote, f.quote)));

  // Çapraz kontrol: model kaçırdıysa (veya susturulduysa) kural motoru yakalar. Skora girmez.
  const ruleHits = runRules(text);
  const unconfirmed = ruleHits
    .filter((h) => !findings.some((f) => f.category === h.category && f.start < h.end + 300 && f.end > h.start - 300))
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .slice(0, 25)
    .map((h) => ({ category: h.category, category_label: CATEGORIES[h.category].label, severity: h.severity, quote: clip(h.quote, 420), start: h.start, end: h.end, source: 'rules' }));

  const scored = computeScore(findings);
  const documentType = pickDocType(docTypes);

  const uncertainties = [...modelUncertainties.slice(0, 8)];
  const sys = (topic, reason_tr) => uncertainties.push({ topic, reason_tr, source: 'system' });
  if (failures.length) sys('Eksik analiz', `${chunks.length} bölümden ${failures.length} tanesi analiz edilemedi; skor eksik olabilir (${failures[0].error}).`);
  if (truncated) sys('Metin kısaltıldı', `Metin ${opt.maxChars.toLocaleString('tr-TR')} karakterden uzundu; sonrası analiz edilmedi.`);
  if (rejected.length) sys('Reddedilen iddialar', `Model ${rejected.length} iddia üretti ancak alıntıları metinde birebir bulunamadığı için geçersiz sayıldı. Bunlar skora girmedi.`);
  if (unconfirmed.length) sys('Doğrulanmamış işaretler', `Kural motoru ${unconfirmed.length} ifadeyi riskli olarak işaretledi, modelin doğrulanmış bulguları bunları kapsamıyor. İnsan gözüyle kontrol edin; skora dahil değil.`);
  if (!findings.length && unconfirmed.length) sys('Model risk bulamadı', 'Modelin doğrulanmış bulgusu yok ama kural motoru işaret üretti. "Risk yok" sonucuna güvenmeyin.');
  if (san.integrity === 'suspicious') sys('Sayfada yapay zekâya yönelik metin', 'Sayfada analiz sistemini yönlendirmeye çalışan metin bulundu ve analizden çıkarıldı. Bu belgenin sonucuna ek şüpheyle yaklaşın.');
  if (['other', 'unclear'].includes(documentType)) sys('Belge türü belirsiz', 'Sayfa bir sözleşme/politika metnine benzemiyor olabilir.');
  const low = findings.filter((f) => f.confidence < 0.5).length;
  if (low) sys('Düşük güvenli bulgular', `${low} bulgu için model düşük güven bildirdi.`);

  const report = {
    schema_version: 1,
    generated_at: now().toISOString(),
    disclaimer_tr: DISCLAIMER_TR,
    source: { url: capture.url || null, title: capture.title || null, chars_analyzed: text.length, truncated },
    document_type: documentType,
    document_type_label_tr: DOC_TYPE_LABEL_TR[documentType] || documentType,
    risk: { score: scored.score, band: scored.band, formula: `100·(1−exp(−Σ ağırlık·şiddet·güven / ${SCORE_K}))`, raw: scored.raw, verified_findings: findings.length },
    summary_tr: buildSummary({ documentType, findings, scored, unconfirmed, integrity: san.integrity }),
    findings: findings.map((f, i) => ({
      id: `F${i + 1}`, category: f.category, category_label: CATEGORIES[f.category].label, severity: f.severity, severity_label: SEVERITY_LABEL_TR[f.severity],
      quote: f.quote, explanation_tr: f.explanation_tr, confidence: +f.confidence.toFixed(2), low_confidence: f.confidence < 0.5,
      start: f.start, end: f.end,
    })),
    unconfirmed_flags: unconfirmed,
    uncertainties,
    rejected_claims: rejected.map((r) => ({ category: r.finding.category, quote: clip(String(r.finding.quote ?? ''), 200), reasons: r.reasons })),
    security: { integrity: san.integrity, removed: san.removed.slice(0, 20), stats: san.stats },
    meta: { model, chunks: chunks.length, failed_chunks: failures.length, duration_ms: Date.now() - t0 },
  };
  onProgress({ stage: 'done', message: 'Tamamlandı' });
  return report;
}

function sevRank(s) { return s === 'high' ? 3 : s === 'medium' ? 2 : 1; }

function locateOverlap(a, b) {
  const x = a.replace(/\s+/g, ' ').toLowerCase().slice(0, 40);
  return b.replace(/\s+/g, ' ').toLowerCase().includes(x);
}

function pickDocType(types) {
  const counts = new Map();
  for (const t of types) if (t && t !== 'unclear') counts.set(t, (counts.get(t) || 0) + 1);
  if (!counts.size) return types.includes('unclear') ? 'unclear' : 'other';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function buildSummary({ documentType, findings, scored, unconfirmed, integrity }) {
  const t = DOC_TYPE_LABEL_TR[documentType] || 'Belge';
  if (!findings.length) {
    return `${t}: doğrulanmış riskli madde bulunamadı. Bu, belgenin risksiz olduğu anlamına gelmez; yalnızca alıntıyla kanıtlanabilen bir bulgu çıkmadı.` +
      (unconfirmed.length ? ` Ayrıca ${unconfirmed.length} doğrulanmamış işaret var.` : '') +
      (integrity === 'suspicious' ? ' Sayfada analizi yönlendirmeye çalışan metin tespit edildi.' : '');
  }
  const top = [...findings].sort((a, b) => sevRank(b.severity) * CATEGORIES[b.category].weight - sevRank(a.severity) * CATEGORIES[a.category].weight);
  const names = [...new Set(top.map((f) => CATEGORIES[f.category].label))].slice(0, 3).join('; ');
  return `${t}: ${findings.length} doğrulanmış riskli madde, risk skoru ${scored.score}/100 (${scored.band.label}). En öne çıkanlar: ${names}.`;
}
