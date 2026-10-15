// DETERMİNİSTİK doğrulama: modelin çıktısına güvenilmez; her bulgu bağımsız olarak denetlenir.
//   1. Çıktı geçerli JSON ve şemaya uygun olmalı.
//   2. Her bulguda quote, kaynak metinde (normalize edilmiş) birebir bulunmalı. Bulunamazsa bulgu GEÇERSİZ.
//   3. Model metinlerinde URL / HTML / yer tutucu bulunamaz (veri sızdırma ve XSS yüzeyi).
//   4. Çakışan/yinelenen bulgular tekilleştirilir.
import { REPORT_SCHEMA, FINDING_SCHEMA } from './schema.js';
import { validateSchema } from './schema-validate.js';
import { locateQuote } from './normalize.js';
import { PLACEHOLDER } from './injection.js';

const URL_RE = /(?:https?:|ftp:|data:|javascript:|file:)\/\/?|\bwww\.[a-z0-9-]+\.[a-z]{2,}|\]\(|<\s*\/?\s*[a-z][^>]*>/i;

export function parseModelJson(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'not_text' };
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1];
  if (!s.startsWith('{')) {
    const i = s.indexOf('{');
    const j = s.lastIndexOf('}');
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
  }
  try { return { ok: true, value: JSON.parse(s) }; } catch (e) { return { ok: false, reason: 'invalid_json' }; }
}

/**
 * @param {string} raw  modelin ham çıktısı
 * @param {{text:string,norm:string,map:number[]}} src  prepareSource() çıktısı
 * @returns {{ok:boolean, documentType?:string, accepted:object[], rejected:object[], uncertainties:object[], errors?:object[]}}
 */
export function validateModelOutput(raw, src) {
  const parsed = parseModelJson(raw);
  if (!parsed.ok) return { ok: false, accepted: [], rejected: [], uncertainties: [], errors: [{ code: parsed.reason }] };
  const obj = parsed.value;

  // Üst düzey şema: findings dizisini öğe öğe ayrıca doğrularız ki tek kötü bulgu tüm raporu öldürmesin.
  const top = validateSchema({ ...REPORT_SCHEMA, properties: { ...REPORT_SCHEMA.properties, findings: { type: 'array' } } }, obj);
  if (top.length) return { ok: false, accepted: [], rejected: [], uncertainties: [], errors: top };

  const accepted = [];
  const rejected = [];
  obj.findings.forEach((f, i) => {
    const reasons = [];
    const schemaErrs = validateSchema(FINDING_SCHEMA, f, `$.findings[${i}]`);
    if (schemaErrs.length) reasons.push(...schemaErrs.map((e) => `schema:${e.code}:${e.path.split('.').pop()}`));
    let loc = null;
    if (!schemaErrs.some((e) => e.path.endsWith('.quote'))) {
      loc = locateQuote(src, f.quote);
      if (!loc.ok) reasons.push(`quote:${loc.reason}`);
      else if (f.quote.includes(PLACEHOLDER)) reasons.push('quote:placeholder');
    }
    // Model açıklamasında bağlantı/HTML/yer tutucu olamaz (sızdırma ve XSS yüzeyi). Alıntı zaten kaynakta bulunmak zorunda.
    if (typeof f.explanation_tr === 'string' && (URL_RE.test(f.explanation_tr) || f.explanation_tr.includes(PLACEHOLDER))) reasons.push('unsafe_content:explanation_tr');
    if (reasons.length) rejected.push({ finding: f, reasons });
    else accepted.push({ ...f, start: loc.start, end: loc.end, exactQuote: loc.exact, source: 'model' });
  });

  const uncertainties = [];
  for (const u of obj.uncertainties) {
    const errs = validateSchema(REPORT_SCHEMA.properties.uncertainties.items, u);
    if (errs.length || URL_RE.test(u.topic + ' ' + u.reason_tr)) continue;
    uncertainties.push({ topic: u.topic, reason_tr: u.reason_tr, source: 'model' });
  }
  return { ok: true, documentType: obj.document_type, accepted, rejected, uncertainties };
}

/** Çakışan aralıklar: aynı kategoride -> yüksek güvenli olan kalır; farklı kategoride ikisi de kalır. */
export function dedupeFindings(findings) {
  const sorted = [...findings].sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const f of sorted) {
    const dup = kept.find((k) => k.category === f.category && f.start < k.end && f.end > k.start);
    if (!dup) kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start);
}
