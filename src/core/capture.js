// DOM -> metin yakalama. Görünür ve gizli metni AYIRIR (gizli metin modele gitmez, injection taramasına girer).
// document/window parametre olarak verilir: gerçek tarayıcıda ve jsdom testlerinde aynı kod çalışır.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'HEAD', 'TITLE', 'META', 'LINK']);
const CHROME_TAGS = new Set(['NAV', 'FOOTER', 'ASIDE']);
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'TR', 'TABLE', 'BLOCKQUOTE', 'PRE', 'DT', 'DD', 'HEADER', 'MAIN', 'FORM', 'FIELDSET', 'DETAILS', 'SUMMARY', 'TD', 'TH']);
const OWN_ATTR = 'data-tos-risk-lens';

function parseRGB(c) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || '');
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}

export function captureDocument(doc, win, { withNodeIndex = false } = {}) {
  const hasLayout = (() => { try { const r = doc.documentElement.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch { return false; } })();
  const hiddenCache = new WeakMap();

  function hiddenReason(el) {
    if (!el) return null;
    if (hiddenCache.has(el)) return hiddenCache.get(el);
    let reason = null;
    const cs = win.getComputedStyle(el);
    if (el.hasAttribute('hidden') && !el.closest('details')) reason = 'hidden-attr';
    else if (cs.display === 'none') {
      // Kapalı <details> içeriği meşru "akordeon" kabul edilir (ToS sayfalarında yaygın) -> hidden sayılmaz.
      reason = el.closest('details:not([open])') && !el.matches('details:not([open])') ? null : 'display:none';
    }
    else if (cs.visibility === 'hidden' || cs.visibility === 'collapse') reason = 'visibility:hidden';
    else if (parseFloat(cs.opacity) < 0.05) reason = 'opacity:0';
    else if (parseFloat(cs.fontSize) < 2) reason = 'tiny-font';
    else if (parseFloat(cs.textIndent) <= -500) reason = 'text-indent';
    else if (cs.clip && /rect\(\s*0(px)?[,\s]+0(px)?[,\s]+0(px)?[,\s]+0(px)?\s*\)/.test(cs.clip)) reason = 'clip';
    else if (/inset\(\s*50%\s*\)|inset\(\s*100%/.test(cs.clipPath || '')) reason = 'clip-path';
    else {
      const col = parseRGB(cs.color);
      if (col && col.a === 0) reason = 'transparent-text';
      else if (col) {
        let bg = null;
        for (let a = el; a && a.nodeType === 1 && !bg; a = a.parentElement) {
          const b = parseRGB(win.getComputedStyle(a).backgroundColor);
          if (b && b.a > 0.9) bg = b;
        }
        if (bg && Math.abs(bg.r - col.r) + Math.abs(bg.g - col.g) + Math.abs(bg.b - col.b) < 12) reason = 'same-color-as-background';
      }
      if (!reason && (cs.position === 'absolute' || cs.position === 'fixed') &&
          (parseFloat(cs.left) <= -500 || parseFloat(cs.top) <= -500 || parseFloat(cs.right) <= -5000)) reason = 'off-screen-style';
      if (!reason && hasLayout) {
        const r = el.getBoundingClientRect();
        const sw = doc.documentElement.scrollWidth;
        if (r.width === 0 && r.height === 0 && cs.display !== 'inline') reason = 'zero-size';
        else if (r.right < -200 || (r.bottom < -200 && cs.position !== 'static') || r.left > sw + 200) reason = 'off-screen';
      }
    }
    if (!reason && el.parentElement && el.parentElement !== doc.documentElement) reason = hiddenReason(el.parentElement);
    hiddenCache.set(el, reason);
    return reason;
  }

  const body = doc.body;
  const bodyText = (body.innerText || body.textContent || '').length;
  let root = body;
  const cands = [...doc.querySelectorAll('main, article, [role="main"]')];
  let best = null;
  for (const c of cands) { const l = (c.textContent || '').length; if (!best || l > best.l) best = { c, l }; }
  if (best && best.l >= 0.4 * (body.textContent || '').length) root = best.c;

  const parts = [];
  const hidden = [];
  const nodeIndex = [];
  let len = 0;
  let lastBlock = null;
  let collapsedChars = 0;

  const push = (s) => { parts.push(s); len += s.length; };
  const walker = doc.createTreeWalker(root, 1 | 4 | 128, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        if (SKIP_TAGS.has(n.tagName.toUpperCase()) || n.hasAttribute(OWN_ATTR)) return 2; // REJECT subtree
        if (root === body && (CHROME_TAGS.has(n.tagName) || ['navigation', 'banner', 'contentinfo', 'complementary'].includes(n.getAttribute('role')))) return 2;
        return 1;
      }
      return 1;
    },
  });

  // Yalnızca öğe/yorum/metin düğümleri
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 1) {
      // öznitelik tabanlı gizli metin (alt/title/aria-label): sadece tarama için topla
      for (const a of ['alt', 'title', 'aria-label', 'aria-description', 'data-prompt', 'data-instruction']) {
        const v = n.getAttribute(a);
        if (v && v.length > 25) hidden.push({ reason: `attr:${a}`, text: v });
      }
      if (n.tagName === 'BR') { push('\n'); lastBlock = null; }
      continue;
    }
    if (n.nodeType === 8) { // yorum
      const t = (n.nodeValue || '').trim();
      if (t.length > 25) hidden.push({ reason: 'html-comment', text: t });
      continue;
    }
    const raw = n.nodeValue;
    if (!raw || !raw.trim()) continue;
    const el = n.parentElement;
    const reason = hiddenReason(el);
    if (reason) { hidden.push({ reason, text: raw.trim() }); continue; }
    if (el.closest('details:not([open])')) collapsedChars += raw.length;
    let block = el;
    while (block && block !== root && !BLOCK_TAGS.has(block.tagName)) block = block.parentElement;
    if (lastBlock && block !== lastBlock) push('\n');
    lastBlock = block;
    const start = len;
    const t = raw.replace(/\s+/g, ' ');
    push(t);
    if (withNodeIndex) nodeIndex.push({ node: n, start, end: len });
  }

  let text = parts.join('');
  text = text.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n');
  // nodeIndex ofsetleri ham birleşime göredir; vurgulama için ham metni de ver
  const out = {
    url: win.location?.href || '',
    title: doc.title || '',
    text: text.trim(),
    hidden: mergeHidden(hidden),
    stats: { collapsedChars, rootTag: root.tagName, usedMain: root !== body },
  };
  if (withNodeIndex) { out.rawText = parts.join(''); out.nodeIndex = nodeIndex; }
  return out;
}

function mergeHidden(list) {
  // aynı nedenli bitişik parçaları birleştir; çok küçük parçaları ele (<= 3 karakter)
  const out = [];
  for (const h of list) {
    if (!h.text || h.text.length < 4) continue;
    const last = out[out.length - 1];
    if (last && last.reason === h.reason && last.text.length < 5000) last.text += ' ' + h.text;
    else out.push({ ...h });
  }
  return out.slice(0, 200);
}
