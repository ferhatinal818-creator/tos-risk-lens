import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { prepareSource, locateQuote, normalizeWithMap } from '../src/core/normalize.js';
import { validateModelOutput, dedupeFindings, parseModelJson } from '../src/core/validate.js';
import { REPORT_SCHEMA } from '../src/core/schema.js';
import { validateSchema } from '../src/core/schema-validate.js';
import { computeScore } from '../src/core/score.js';
import { finding, modelJson } from './helpers.js';

const DOC = `Terms of Service\n\nYour subscription renews automatically at the end of each billing period “until you cancel”.\nAll payments are non-refundable — including partially used periods.\n\nAny dispute will be resolved by binding arbitration on an individual basis; you waive your right to a jury trial.`;
const SRC = prepareSource(DOC);

test('locateQuote: boşluk/tırnak/tire/büyük-küçük harf farkını tolere eder, ofseti orijinale eşler', () => {
  const r = locateQuote(SRC, 'your subscription   RENEWS automatically at the end of each billing period "until you cancel"');
  assert.equal(r.ok, true);
  assert.equal(DOC.slice(r.start, r.end).startsWith('Your subscription renews'), true);
  assert.equal(DOC.slice(r.start, r.end).endsWith('cancel”'), true);
  const d = locateQuote(SRC, 'All payments are non-refundable - including partially used periods.');
  assert.equal(d.ok, true);
});

test('locateQuote: yeniden yazım, kelime değişimi ve uydurma alıntıyı REDDEDER', () => {
  assert.equal(locateQuote(SRC, 'The subscription automatically renews every billing period unless cancelled').ok, false);
  assert.equal(locateQuote(SRC, 'All payments are refundable within thirty days of purchase').reason, 'not_found_in_source');
  assert.equal(locateQuote(SRC, 'too short').reason, 'too_short');
});

test('locateQuote: "..." ile en fazla 3 sıralı parça; sıra bozulursa reddedilir', () => {
  assert.equal(locateQuote(SRC, 'Your subscription renews automatically ... until you cancel').ok, true);
  assert.equal(locateQuote(SRC, 'until you cancel ... Your subscription renews automatically').ok, false);
  assert.equal(locateQuote(SRC, 'Your subscription ... renews ... automatically ... billing period ...').reason, 'too_many_fragments');
});

test('normalizeWithMap: sıfır genişlikli karakterler atılır', () => {
  const { norm } = normalizeWithMap('bind​ing arbi⁠tration');
  assert.equal(norm, 'binding arbitration');
});

test('validateModelOutput: geçerli bulgu kabul edilir, uydurma alıntı reddedilir', () => {
  const good = finding('auto_renewal', 'Your subscription renews automatically at the end of each billing period');
  const fake = finding('no_refund', 'Refunds are never available under any circumstances whatsoever');
  const v = validateModelOutput(modelJson([good, fake]), SRC);
  assert.equal(v.ok, true);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.rejected.length, 1);
  assert.deepEqual(v.rejected[0].reasons, ['quote:not_found_in_source']);
});

test('validateModelOutput: şema ihlalleri bulgu bazında reddedilir (enum, ek alan, güven aralığı)', () => {
  const base = finding('auto_renewal', 'Your subscription renews automatically at the end of each billing period');
  const v = validateModelOutput(modelJson([
    { ...base, category: 'made_up_category' },
    { ...base, confidence: 1.7 },
    { ...base, extra: 'x' },
    { ...base, quote: undefined },
  ]), SRC);
  assert.equal(v.accepted.length, 0);
  assert.equal(v.rejected.length, 4);
});

test('validateModelOutput: açıklamada URL/HTML/markdown bağlantı bulunan bulgu reddedilir', () => {
  for (const bad of ['Detay için https://evil.example/x adresine bakın, bu madde risklidir.', 'Bu <img src=x onerror=alert(1)> madde risklidir ve dikkat gerektirir.', 'Daha fazlası [burada](javascript:alert(1)) yazıyor, bu risklidir.']) {
    const v = validateModelOutput(modelJson([finding('auto_renewal', 'Your subscription renews automatically at the end of each billing period', { explanation_tr: bad })]), SRC);
    assert.equal(v.accepted.length, 0, bad);
    assert.ok(v.rejected[0].reasons.includes('unsafe_content:explanation_tr'));
  }
});

test('validateModelOutput: üst düzey şema ihlali (ek alan / geçersiz JSON) tüm çıktıyı geçersiz kılar', () => {
  assert.equal(validateModelOutput('{"risk_score": 0}', SRC).ok, false);
  assert.equal(validateModelOutput('Sure! Here is the report', SRC).ok, false);
  const wrapped = '```json\n' + modelJson([]) + '\n```';
  assert.equal(validateModelOutput(wrapped, SRC).ok, true);
});

test('dedupeFindings: aynı kategoride çakışanlar tekilleşir, yüksek güven kalır', () => {
  const a = { category: 'auto_renewal', start: 0, end: 100, confidence: 0.6 };
  const b = { category: 'auto_renewal', start: 50, end: 150, confidence: 0.9 };
  const c = { category: 'no_refund', start: 60, end: 120, confidence: 0.5 };
  const out = dedupeFindings([a, b, c]);
  assert.equal(out.length, 2);
  assert.ok(out.includes(b) && out.includes(c));
});

test('score: deterministik, monoton ve 0–100 aralığında', () => {
  assert.equal(computeScore([]).score, 0);
  const one = computeScore([{ category: 'arbitration_class_waiver', severity: 'high', confidence: 0.9 }]);
  const two = computeScore([{ category: 'arbitration_class_waiver', severity: 'high', confidence: 0.9 }, { category: 'data_sharing', severity: 'high', confidence: 0.9 }]);
  assert.ok(one.score > 0 && two.score > one.score && two.score <= 100);
  assert.deepEqual(computeScore([{ category: 'data_sharing', severity: 'low', confidence: 0.8 }]), computeScore([{ category: 'data_sharing', severity: 'low', confidence: 0.8 }]));
  const many = computeScore(Array.from({ length: 40 }, () => ({ category: 'data_sharing', severity: 'high', confidence: 1 })));
  assert.ok(many.score <= 100);
});

test('elle yazılmış şema doğrulayıcı, Ajv ile aynı kararı verir (çapraz doğrulama)', () => {
  const ajv = new Ajv({ allErrors: true });
  const check = ajv.compile(REPORT_SCHEMA);
  const q = 'Your subscription renews automatically at the end of each billing period';
  const cases = [
    JSON.parse(modelJson([finding('auto_renewal', q)])),
    JSON.parse(modelJson([])),
    { document_type: 'nope', findings: [], uncertainties: [] },
    { document_type: 'other', findings: [{ ...finding('auto_renewal', q), extra: 1 }], uncertainties: [] },
    { document_type: 'other', findings: [{ ...finding('auto_renewal', q), confidence: 2 }], uncertainties: [] },
    { document_type: 'other', findings: [{ ...finding('auto_renewal', 'kısa'), }], uncertainties: [] },
    { document_type: 'other', findings: [], uncertainties: [{ topic: 'x' }] },
    { findings: [], uncertainties: [] },
    { document_type: 'other', findings: 'none', uncertainties: [] },
  ];
  for (const c of cases) {
    assert.equal(validateSchema(REPORT_SCHEMA, c).length === 0, check(c), JSON.stringify(c).slice(0, 80));
  }
});

test('parseModelJson: çitli / önsözlü çıktıdan JSON çıkarır', () => {
  assert.equal(parseModelJson('Here you go: {"a":1} thanks').ok, true);
  assert.equal(parseModelJson('no json here').ok, false);
});
