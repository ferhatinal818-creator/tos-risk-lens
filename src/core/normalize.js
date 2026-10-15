// Metin normalizasyonu + orijinal metne ofset haritası.
// Alıntı doğrulaması "boşluk/tırnak/tire/büyük-küçük harf" farklarını tolere eder,
// ama kelime düzeyinde HİÇBİR değişikliği (yeniden yazım, çeviri, birleştirme) tolere etmez.

const CHAR_MAP = new Map([
  ['‘', "'"], ['’', "'"], ['‚', "'"], ['‛', "'"], ['′', "'"],
  ['“', '"'], ['”', '"'], ['„', '"'], ['″', '"'],
  ['–', '-'], ['—', '-'], ['−', '-'], ['‐', '-'], ['‑', '-'],
  [' ', ' '], [' ', ' '], [' ', ' '],
]);
// Sıfır genişlikli / görünmez karakterler: normalizasyonda atılır (ayrıca injection taramasında bayraklanır)
export const ZERO_WIDTH_RE = /[​-‍⁠﻿­‪-‮⁦-⁩]/;

/** @returns {{norm: string, map: number[]}} map[i] = norm[i]'nin orijinal metindeki indeksi */
export function normalizeWithMap(text) {
  let out = '';
  const map = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (ZERO_WIDTH_RE.test(ch)) continue;
    if (CHAR_MAP.has(ch)) ch = CHAR_MAP.get(ch);
    if (/\s/.test(ch)) {
      if (!lastSpace) { out += ' '; map.push(i); lastSpace = true; }
      continue;
    }
    const lower = ch.toLowerCase();
    out += lower.length === 1 ? lower : ch;
    map.push(i);
    lastSpace = false;
  }
  if (out.endsWith(' ')) { out = out.slice(0, -1); map.pop(); }
  return { norm: out, map };
}

export function prepareSource(text) {
  const { norm, map } = normalizeWithMap(text);
  return { text, norm, map };
}

const ELLIPSIS_RE = /\s*(?:\.{3}|…)\s*/;

export const QUOTE_LIMITS = { minLen: 20, maxLen: 600, maxSegments: 3, minSegment: 10, maxSpan: 1500 };

/**
 * Alıntıyı kaynak metinde bulur.
 * - Tek parça: normalize edilmiş birebir alt dizi olmalı.
 * - "..." ile en fazla 3 parça: her parça sırayla ve birebir bulunmalı, toplam yayılma <= maxSpan.
 * @returns {{ok:true,start:number,end:number,exact:boolean}|{ok:false,reason:string}}
 */
export function locateQuote(src, quote, limits = QUOTE_LIMITS) {
  if (typeof quote !== 'string') return { ok: false, reason: 'not_a_string' };
  const q = normalizeWithMap(quote).norm;
  const segs = q.split(ELLIPSIS_RE).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { ok: false, reason: 'empty' };
  if (segs.length > limits.maxSegments) return { ok: false, reason: 'too_many_fragments' };
  const total = segs.reduce((n, s) => n + s.length, 0);
  if (total < limits.minLen) return { ok: false, reason: 'too_short' };
  if (q.length > limits.maxLen) return { ok: false, reason: 'too_long' };
  let pos = 0;
  let first = -1;
  for (const s of segs) {
    if (segs.length > 1 && s.length < limits.minSegment) return { ok: false, reason: 'fragment_too_short' };
    const i = src.norm.indexOf(s, pos);
    if (i < 0) return { ok: false, reason: 'not_found_in_source' };
    if (first < 0) first = i;
    pos = i + s.length;
  }
  const start = src.map[first];
  const end = src.map[pos - 1] + 1;
  if (end - start > limits.maxSpan) return { ok: false, reason: 'span_too_wide' };
  return { ok: true, start, end, exact: segs.length === 1 };
}

/** Kısa, kararlı özet (hash) — rapor meta verisi için. */
export async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
