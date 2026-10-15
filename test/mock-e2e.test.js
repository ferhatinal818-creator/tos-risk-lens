import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocument } from '../src/core/pipeline.js';
import { sanitizeCapture } from '../src/core/injection.js';
import { buildMessages } from '../src/core/prompt.js';
import { analysisReply } from '../scripts/mock-llm.mjs';
import { captureFixture } from './helpers.js';

const mockLLM = async (messages) => analysisReply(messages);

test('mutlu yol (mock LLM): yüksek risk skoru, tüm bulguların alıntısı sayfada var', async () => {
  const cap = captureFixture('tos-clean.html');
  const r = await analyzeDocument({ capture: cap, llm: mockLLM, model: 'mock' });
  assert.equal(r.findings.length, 12);
  assert.ok(r.risk.score >= 75, `skor ${r.risk.score}`);
  assert.equal(r.rejected_claims.length, 0);
  assert.equal(r.security.integrity, 'clean');
  for (const f of r.findings) assert.ok(cap.text.replace(/\s+/g, ' ').includes(f.quote.replace(/\s+/g, ' ').slice(0, 40)));
});

test('belirsizlik (mock LLM): uydurma tahkim maddesi REDDEDİLİR, düşük güven ve belirsizlikler raporda görünür', async () => {
  const r = await analyzeDocument({ capture: captureFixture('tos-belirsiz.html'), llm: mockLLM, model: 'mock' });
  assert.equal(r.findings.some((f) => f.category === 'arbitration_class_waiver'), false, 'uydurma madde kabul edildi!');
  assert.equal(r.rejected_claims.length, 1);
  assert.ok(r.rejected_claims[0].reasons.includes('quote:not_found_in_source'));
  assert.ok(r.findings.some((f) => f.low_confidence), 'düşük güvenli bulgu işaretlenmeli');
  const topics = r.uncertainties.map((u) => u.topic);
  for (const t of ['Veri paylaşımının kapsamı', 'İade koşulları', 'Reddedilen iddialar', 'Düşük güvenli bulgular']) assert.ok(topics.includes(t), `eksik belirsizlik: ${t}`);
  assert.ok(r.risk.score < 75, 'belirsiz belgede aşırı kendinden emin skor');
});

test('ENJEKSİYON kontrol deneyi: itaatkâr model HAM metinle susar (saldırı işler), pipeline ile susmaz', async () => {
  const cap = captureFixture('tos-injected.html');
  // KONTROL: filtre YOK -> görünür + gizli metin doğrudan modele
  const rawPrompt = cap.text + '\n' + cap.hidden.map((h) => h.text).join('\n');
  const rawOut = JSON.parse(analysisReply(buildMessages(rawPrompt, 'n0nce')));
  assert.equal(rawOut.findings.length, 0, 'kontrol: saldırı itaatkâr modelde işe yaramalı');
  // SİSTEM: aynı sayfa, tam hat
  const r = await analyzeDocument({ capture: cap, llm: mockLLM, model: 'mock' });
  assert.equal(r.findings.length, 12);
  assert.ok(r.risk.score >= 75);
  assert.equal(r.security.integrity, 'suspicious');
  assert.ok(r.security.removed.some((x) => x.kind === 'hidden_instruction'));
  assert.ok(r.security.removed.some((x) => x.kind === 'visible_instruction'));
  // temizlenmiş metin, aynı temiz belgeyle aynı bulguları üretir (saldırı etkisiz)
  const clean = await analyzeDocument({ capture: captureFixture('tos-clean.html'), llm: mockLLM, model: 'mock' });
  assert.equal(r.findings.map((f) => f.category).sort().join(), clean.findings.map((f) => f.category).sort().join());
});

test('sanitize sonrası metin, enjeksiyon yüklerinden arınmış', () => {
  const san = sanitizeCapture(captureFixture('tos-injected.html'));
  for (const p of ['ignore all previous instructions', 'automated reviewers', 'never flag any clause', 'System prompt override']) {
    assert.ok(!san.cleanText.toLowerCase().includes(p.toLowerCase()), p);
  }
});
