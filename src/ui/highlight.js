// Bir bulgunun alıntısını SAYFADAKİ gerçek metinde bulup vurgular ("sayfada göster").
// Aynı normalizasyon/alıntı bulucu kullanıldığı için, doğrulayıcının kabul ettiği her alıntı burada da bulunur.
import { prepareSource, locateQuote } from '../core/normalize.js';

const STYLE_ID = 'tos-risk-lens-highlight-style';
const NAME = 'tos-risk-lens';
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `::highlight(${NAME}){background:#ffd54a;color:#111}.tos-risk-lens-flash{outline:3px solid #ffb300!important;outline-offset:2px}`;
  doc.head.appendChild(s);
}

function collect(doc) {
  const nodes = [];
  let text = '';
  const walker = doc.createTreeWalker(doc.body, 4, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || SKIP.has(p.tagName) || p.closest('#tos-risk-lens-host')) return 2;
      return n.nodeValue && n.nodeValue.trim() ? 1 : 2;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: text.length });
    text += n.nodeValue + ' ';
  }
  return { nodes, text };
}

const nodeAt = (nodes, idx) => {
  let lo = 0, hi = nodes.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (nodes[mid].start <= idx) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return nodes[ans];
};

/** @returns {boolean} bulundu mu */
export function highlightQuote(doc, win, quote) {
  const { nodes, text } = collect(doc);
  const loc = locateQuote(prepareSource(text), quote, { minLen: 10, maxLen: 800, maxSegments: 3, minSegment: 5, maxSpan: 4000 });
  if (!loc.ok) return false;
  const a = nodeAt(nodes, loc.start);
  const b = nodeAt(nodes, loc.end - 1);
  const range = doc.createRange();
  range.setStart(a.node, Math.min(a.node.nodeValue.length, loc.start - a.start));
  range.setEnd(b.node, Math.min(b.node.nodeValue.length, Math.max(1, loc.end - b.start)));
  for (let el = a.node.parentElement; el; el = el.parentElement.closest('details:not([open])')) { // kapalı akordeonu aç
    const d = el.closest('details:not([open])');
    if (!d) break;
    d.setAttribute('open', '');
    el = d;
  }
  ensureStyle(doc);
  const target = a.node.parentElement;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (win.CSS && win.CSS.highlights && typeof win.Highlight === 'function') {
    win.CSS.highlights.clear();
    win.CSS.highlights.set(NAME, new win.Highlight(range));
  } else {
    target.classList.add('tos-risk-lens-flash');
    win.setTimeout(() => target.classList.remove('tos-risk-lens-flash'), 2500);
  }
  return true;
}

export function clearHighlight(win) {
  try { win.CSS?.highlights?.clear(); } catch { /* yoksay */ }
}
