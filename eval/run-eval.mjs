// Mini eval koşucusu.  node eval/run-eval.mjs --mode rules|llm [--tag isim]
//  rules: yalnızca deterministik kural motoru (LLM'siz taban çizgisi)
//  llm  : eval/runs/<doc>/chunk-N.out.txt dosyalarındaki HAM model çıktıları, üretimdeki doğrulayıcıdan geçirilerek
// Eşleşme: aynı kategori + altın alıntının ±150 karakter çevresiyle kesişen aralık.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSource, locateQuote } from '../src/core/normalize.js';
import { sanitizeCapture } from '../src/core/injection.js';
import { chunkText } from '../src/core/chunk.js';
import { validateModelOutput, dedupeFindings } from '../src/core/validate.js';
import { runRules } from '../src/core/rules.js';
import { computeScore } from '../src/core/score.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const MODE = arg('mode', 'rules');
const TAG = arg('tag', MODE);
const SLACK = 150;
const CHUNK = { size: 12000, overlap: 600 };

const gold = JSON.parse(readFileSync(path.join(here, 'gold.json'), 'utf8'));
const RELAXED = { minLen: 5, maxLen: 2000, maxSegments: 1, minSegment: 1, maxSpan: 5000 };
const overlaps = (a, b) => a.start < b.end + SLACK && a.end > b.start - SLACK;
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);
const clip = (s, n = 150) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

function locateGold(src, list) {
  return list.map((g) => {
    const r = locateQuote(src, g.quote, RELAXED);
    if (!r.ok) throw new Error(`altın alıntı bulunamadı: ${g.id}`);
    return { ...g, start: r.start, end: r.end };
  });
}

function getFindings(docId, text) {
  if (MODE === 'rules') {
    return { findings: runRules(text).map((h) => ({ category: h.category, start: h.start, end: h.end, quote: h.quote, severity: h.severity, confidence: 1 })), claimed: null, rejected: [], missingOutputs: 0 };
  }
  // llm: üretimdeki akışın aynısı (sanitize -> chunk -> doğrula -> dedupe)
  const san = sanitizeCapture({ text, hidden: [] });
  const src = prepareSource(san.cleanText);
  const chunks = chunkText(san.cleanText, CHUNK);
  let accepted = [], rejected = [], claimed = 0, missing = 0, invalid = 0;
  for (const c of chunks) {
    const f = path.join(here, 'runs', docId, `chunk-${c.index}.out.txt`);
    if (!existsSync(f)) { missing++; continue; }
    const v = validateModelOutput(readFileSync(f, 'utf8'), src);
    if (!v.ok) { invalid++; continue; }
    claimed += v.accepted.length + v.rejected.length;
    accepted = accepted.concat(v.accepted);
    rejected = rejected.concat(v.rejected);
  }
  return { findings: dedupeFindings(accepted), claimed, rejected, missingOutputs: missing, invalidChunks: invalid, chunks: chunks.length, cleanText: san.cleanText };
}

const perDoc = {};
const tot = { must: 0, mustCaught: 0, mustLoc: 0, border: 0, borderCaught: 0, traps: 0, trapHits: 0, findings: 0, tp: 0, fp: 0, claimed: 0, rejected: 0 };

for (const [docId, d] of Object.entries(gold.docs)) {
  const raw = readFileSync(path.join(here, 'corpus', `${docId}.txt`), 'utf8');
  const san = sanitizeCapture({ text: raw, hidden: [] });
  const text = san.cleanText; // korpus normal metin; sanitize yalnızca yanlış alarm olup olmadığını görmek için çalışır
  const src = prepareSource(text);
  const run = getFindings(docId, raw);
  const evalText = MODE === 'llm' ? run.cleanText : text;
  const evalSrc = prepareSource(evalText);
  const must = locateGold(evalSrc, d.must), border = locateGold(evalSrc, d.borderline), traps = locateGold(evalSrc, d.traps);
  const F = run.findings;

  const caught = must.map((g) => ({ g, hit: F.find((f) => f.category === g.category && overlaps(f, g)) || null, loc: F.find((f) => overlaps(f, g)) || null }));
  const borderCaught = border.map((g) => ({ g, hit: F.find((f) => f.category === g.category && overlaps(f, g)) || null }));
  const trapHits = traps.map((g) => ({ g, hit: F.find((f) => f.category === g.category && overlaps(f, g)) || null }));

  const isTP = (f) => [...must, ...border].some((g) => g.category === f.category && overlaps(f, g));
  const fps = F.filter((f) => !isTP(f));
  const tps = F.length - fps.length;

  perDoc[docId] = {
    must: must.length, mustCaught: caught.filter((c) => c.hit).length, mustLocOnly: caught.filter((c) => !c.hit && c.loc).length,
    borderline: border.length, borderCaught: borderCaught.filter((c) => c.hit).length,
    traps: traps.length, trapHits: trapHits.filter((t) => t.hit).length,
    findings: F.length, truePos: tps, falsePos: fps.length,
    claimed: run.claimed, rejectedByVerifier: run.rejected.length, missingOutputs: run.missingOutputs, invalidChunks: run.invalidChunks || 0,
    missed: caught.filter((c) => !c.hit).map((c) => ({ id: c.g.id, category: c.g.category, quote: clip(c.g.quote), wrongCategoryNearby: !!c.loc })),
    falseAlarms: fps.map((f) => ({ category: f.category, quote: clip(f.quote), nearTrap: trapHits.some((t) => t.g.category === f.category && overlaps(f, t.g)) })),
    trapsFallenFor: trapHits.filter((t) => t.hit).map((t) => ({ id: t.g.id, quote: clip(t.g.quote) })),
    rejectedExamples: run.rejected.slice(0, 5).map((r) => ({ quote: clip(String(r.finding.quote ?? ''), 120), reasons: r.reasons })),
    score: computeScore(F.map((f) => ({ category: f.category, severity: f.severity || 'medium', confidence: f.confidence ?? 1 }))).score,
  };
  const p = perDoc[docId];
  tot.must += p.must; tot.mustCaught += p.mustCaught; tot.mustLoc += p.mustLocOnly; tot.border += p.borderline; tot.borderCaught += p.borderCaught;
  tot.traps += p.traps; tot.trapHits += p.trapHits; tot.findings += p.findings; tot.tp += p.truePos; tot.fp += p.falsePos;
  tot.claimed += p.claimed || 0; tot.rejected += p.rejectedByVerifier;
}

const summary = {
  mode: MODE, tag: TAG, slack_chars: SLACK, documents: Object.keys(gold.docs).length,
  recall_must: pct(tot.mustCaught, tot.must), recall_must_location_only: pct(tot.mustCaught + tot.mustLoc, tot.must),
  precision: pct(tot.tp, tot.findings), borderline_coverage: pct(tot.borderCaught, tot.border),
  trap_rate: pct(tot.trapHits, tot.traps), ...tot,
  quote_rejection_rate: MODE === 'llm' ? pct(tot.rejected, tot.claimed) : null,
};

mkdirSync(path.join(here, 'results'), { recursive: true });
writeFileSync(path.join(here, 'results', `${TAG}.json`), JSON.stringify({ summary, perDoc }, null, 2));

// ---- Konsol özeti
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n=== EVAL (${MODE}) ===`);
console.log(pad('belge', 18), pad('must', 10), pad('borderl.', 10), pad('bulgu', 7), pad('TP', 5), pad('FP', 5), pad('tuzak', 6), pad('ret', 5));
for (const [id, p] of Object.entries(perDoc)) {
  console.log(pad(id, 18), pad(`${p.mustCaught}/${p.must}`, 10), pad(`${p.borderCaught}/${p.borderline}`, 10), pad(p.findings, 7), pad(p.truePos, 5), pad(p.falsePos, 5), pad(`${p.trapHits}/${p.traps}`, 6), pad(p.rejectedByVerifier, 5));
}
console.log(`\nrecall(must)=${summary.recall_must}%  (yalnızca-konum: ${summary.recall_must_location_only}%)  precision=${summary.precision}%  tuzak=${summary.trap_rate}%`);
if (MODE === 'llm') console.log(`doğrulayıcı reddi: ${tot.rejected}/${tot.claimed} iddia (${summary.quote_rejection_rate}%)`);
const missing = Object.values(perDoc).reduce((n, p) => n + p.missingOutputs, 0);
if (missing) console.log(`UYARI: ${missing} parça için model çıktısı yok`);
