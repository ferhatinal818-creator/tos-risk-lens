// Kendi anahtarınızla canlı LLM eval'i:
//   LLM_BASE_URL=https://api.openai.com/v1 LLM_API_KEY=sk-... LLM_MODEL=gpt-4.1-mini npm run eval:live
// Önce `npm run eval:prepare` çalışmış olmalı. Ham çıktıları eval/runs/<doc>/chunk-N.out.txt'ye yazar,
// ardından `npm run eval:llm` aynı doğrulayıcıyla puanlar.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLLM } from '../src/core/llm.js';
import { WIRE_SCHEMA } from '../src/core/schema.js';

const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
if (!LLM_BASE_URL || !LLM_MODEL) { console.error('LLM_BASE_URL, LLM_MODEL (ve genelde LLM_API_KEY) gerekli'); process.exit(1); }
const llm = makeLLM({ baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY, model: LLM_MODEL });
const here = path.dirname(fileURLToPath(import.meta.url));
const runs = path.join(here, 'runs');
for (const doc of readdirSync(runs)) {
  const dir = path.join(runs, doc);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.system.txt'))) {
    const base = f.replace('.system.txt', '');
    const out = path.join(dir, `${base}.out.txt`);
    if (existsSync(out)) continue;
    const messages = [
      { role: 'system', content: readFileSync(path.join(dir, f), 'utf8') },
      { role: 'user', content: readFileSync(path.join(dir, `${base}.user.txt`), 'utf8') },
    ];
    process.stdout.write(`${doc}/${base} ... `);
    writeFileSync(out, await llm(messages, { schema: WIRE_SCHEMA }));
    console.log('ok');
  }
}
