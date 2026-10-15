// Doğrulayıcı stres testi: modelin kabul edilen GERÇEK alıntılarını bozarak "halüsinasyon" üretir
// ve doğrulayıcının hepsini reddedip reddetmediğine bakar. (Gerçek model çıktısı 0 ret verdiği için,
// doğrulayıcının değerini ancak bu şekilde ölçebiliriz.)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeCapture } from '../src/core/injection.js';
import { prepareSource } from '../src/core/normalize.js';
import { chunkText } from '../src/core/chunk.js';
import { validateModelOutput } from '../src/core/validate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(path.join(here, 'gold.json'), 'utf8'));
const mutations = {
  kelime_degistir: (q) => q.replace(/\b(\w{5,})\b/, (m) => m + 'ish'),                       // bir kelimeyi bozar
  es_anlamli_yeniden_yaz: (q) => q.replace(/\bmay\b/i, 'is allowed to').replace(/\byou\b/i, 'the user').replace(/\bwe\b/i, 'the company'),
  iki_cumleyi_birlestir: (q) => q + ' Furthermore, all fees are refunded within 30 days of purchase.', // uydurma ek cümle
  sonu_kes_uydur: (q) => q.slice(0, Math.floor(q.length * 0.6)) + ' and the company guarantees full compensation.',
  turkceye_cevir: () => 'Şirket hesabınızı herhangi bir sebep göstermeden kapatabilir ve içeriğinizi silebilir.',
};
const stats = Object.fromEntries(Object.keys(mutations).map((k) => [k, { tried: 0, rejected: 0, falselyAccepted: [] }]));

for (const docId of Object.keys(gold.docs)) {
  const raw = readFileSync(path.join(here, 'corpus', `${docId}.txt`), 'utf8');
  const clean = sanitizeCapture({ text: raw, hidden: [] }).cleanText;
  const src = prepareSource(clean);
  for (const c of chunkText(clean, { size: 12000, overlap: 600 })) {
    const f = path.join(here, 'runs', docId, `chunk-${c.index}.out.txt`);
    let obj;
    try { obj = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    for (const finding of obj.findings.slice(0, 6)) {
      for (const [name, fn] of Object.entries(mutations)) {
        const mutated = { ...finding, quote: fn(finding.quote) };
        if (mutated.quote === finding.quote) continue; // mutasyon etkisiz kaldıysa sayma
        const v = validateModelOutput(JSON.stringify({ document_type: 'terms_of_service', findings: [mutated], uncertainties: [] }), src);
        stats[name].tried++;
        if (v.accepted.length === 0) stats[name].rejected++;
        else stats[name].falselyAccepted.push(mutated.quote.slice(0, 120));
      }
    }
  }
}
const total = Object.values(stats).reduce((a, s) => ({ tried: a.tried + s.tried, rejected: a.rejected + s.rejected }), { tried: 0, rejected: 0 });
console.log('mutasyon'.padEnd(26), 'denenen', 'reddedilen');
for (const [k, s] of Object.entries(stats)) console.log(k.padEnd(26), String(s.tried).padStart(7), String(s.rejected).padStart(10), s.falselyAccepted.length ? `  KABUL EDİLEN: ${s.falselyAccepted.length}` : '');
console.log(`TOPLAM: ${total.rejected}/${total.tried} reddedildi (${Math.round((1000 * total.rejected) / total.tried) / 10}%)`);
writeFileSync(path.join(here, 'results', 'verifier-stress.json'), JSON.stringify({ total, stats }, null, 2));
