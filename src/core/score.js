// Deterministik risk skoru. LLM skor ÜRETMEZ; yalnızca DOĞRULANMIŞ bulgulardan hesaplanır.
import { CATEGORIES } from './schema.js';

export const SEVERITY_MULT = { low: 0.5, medium: 1, high: 1.6 };
export const SCORE_K = 28; // doygunluk sabiti: raw=K -> ~63

/**
 * score = round(100 * (1 - exp(-raw / K)))
 * raw   = Σ  weight(category) * severityMult * clamp(confidence, 0.5, 1) * dup
 * dup   = 1 aynı kategorideki ilk bulgu, 0.5 sonrakiler (tekrar eden madde skoru şişirmesin)
 */
export function computeScore(findings) {
  const seen = new Map();
  let raw = 0;
  const parts = [];
  const sorted = [...findings].sort((a, b) => weightOf(b) - weightOf(a));
  for (const f of sorted) {
    const n = seen.get(f.category) || 0;
    seen.set(f.category, n + 1);
    const c = CATEGORIES[f.category]?.weight ?? 3;
    const contrib = c * (SEVERITY_MULT[f.severity] ?? 1) * Math.min(1, Math.max(0.5, f.confidence)) * (n === 0 ? 1 : 0.5);
    raw += contrib;
    parts.push({ category: f.category, contrib: +contrib.toFixed(2) });
  }
  const score = Math.round(100 * (1 - Math.exp(-raw / SCORE_K)));
  return { score, raw: +raw.toFixed(2), band: bandOf(score), parts };
}

function weightOf(f) {
  return (CATEGORIES[f.category]?.weight ?? 3) * (SEVERITY_MULT[f.severity] ?? 1) * f.confidence;
}

export function bandOf(score) {
  if (score >= 75) return { key: 'very_high', label: 'Çok yüksek' };
  if (score >= 50) return { key: 'high', label: 'Yüksek' };
  if (score >= 25) return { key: 'medium', label: 'Orta' };
  return { key: 'low', label: 'Düşük' };
}
