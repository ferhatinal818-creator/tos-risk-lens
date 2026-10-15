// Altın etiketlerin alıntılarının gerçekten korpusta bulunduğunu doğrular (aynı normalizasyonla).
import { readFileSync } from 'node:fs';
import { prepareSource, locateQuote } from '../src/core/normalize.js';
import { CATEGORY_KEYS } from '../src/core/schema.js';
const gold = JSON.parse(readFileSync(new URL('./gold.json', import.meta.url)));
let bad = 0, total = 0;
for (const [id, d] of Object.entries(gold.docs)) {
  const text = readFileSync(new URL(`./corpus/${id}.txt`, import.meta.url), 'utf8');
  const src = prepareSource(text);
  for (const kind of ['must', 'borderline', 'traps']) for (const g of d[kind]) {
    total++;
    const r = locateQuote(src, g.quote, { minLen: 5, maxLen: 2000, maxSegments: 1, minSegment: 1, maxSpan: 5000 });
    if (!CATEGORY_KEYS.includes(g.category)) { bad++; console.log('KATEGORİ?', id, g.id, g.category); }
    if (!r.ok) { bad++; console.log('YOK', id, g.id, r.reason, '|', g.quote.slice(0, 70)); }
  }
}
console.log(`${total} etiket, ${bad} sorun`);
process.exit(bad ? 1 : 0);
