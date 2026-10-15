// Her korpus belgesi için üretimdeki akışla birebir aynı mesajları (system+user) diske yazar.
// Bu dosyaları bir model (API ya da elle) yanıtlar; ham çıktı chunk-N.out.txt olarak kaydedilir.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeCapture } from '../src/core/injection.js';
import { chunkText } from '../src/core/chunk.js';
import { buildMessages, randomNonce } from '../src/core/prompt.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(path.join(here, 'gold.json'), 'utf8'));
let n = 0;
for (const id of Object.keys(gold.docs)) {
  const raw = readFileSync(path.join(here, 'corpus', `${id}.txt`), 'utf8');
  const clean = sanitizeCapture({ text: raw, hidden: [] }).cleanText;
  const chunks = chunkText(clean, { size: 12000, overlap: 600 });
  const dir = path.join(here, 'runs', id);
  mkdirSync(dir, { recursive: true });
  const nonce = randomNonce();
  for (const c of chunks) {
    const messages = buildMessages(c.text, nonce);
    writeFileSync(path.join(dir, `chunk-${c.index}.system.txt`), messages[0].content);
    writeFileSync(path.join(dir, `chunk-${c.index}.user.txt`), messages[1].content);
    n++;
  }
  console.log(id.padEnd(18), chunks.length, 'parça');
}
console.log(`toplam ${n} parça -> eval/runs/`);
