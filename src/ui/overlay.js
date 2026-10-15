// Sayfa içi (Shadow DOM) rapor arayüzü. Taşıma katmanından bağımsız: uzantıda content script,
// demo/Cypress'te harness aynı modülü kullanır. TÜM metinler textContent ile basılır (innerHTML yok).
import { highlightQuote } from './highlight.js';

export const HOST_ID = 'tos-risk-lens-host';
export const DISCLAIMER_TR = 'Bu uygulama hukuki tavsiye vermez. Sonuçlar otomatik bir metin analizidir, yanılabilir ve avukat görüşünün yerini tutmaz.';

const REASON_TR = {
  'quote:not_found_in_source': 'Alıntı sayfa metninde birebir bulunamadı',
  'quote:too_short': 'Alıntı çok kısa', 'quote:too_long': 'Alıntı çok uzun', 'quote:empty': 'Alıntı boş',
  'quote:too_many_fragments': 'Alıntı çok parçalı', 'quote:fragment_too_short': 'Alıntı parçası çok kısa',
  'quote:span_too_wide': 'Alıntı parçaları birbirinden çok uzak', 'quote:placeholder': 'Alıntı çıkarılmış güvensiz metni içeriyor',
  'unsafe_content:explanation_tr': 'Açıklamada bağlantı/HTML var',
};
const reasonTr = (r) => REASON_TR[r] || (r.startsWith('schema:') ? 'Şemaya uymuyor' : r);
const SEV_ORDER = { high: 0, medium: 1, low: 2 };

const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.root{--bg:#ffffff;--fg:#1b1b1f;--muted:#5b5b66;--line:#e2e2ea;--card:#f7f7fb;--accent:#3b5bdb;--warn-bg:#fff4e0;--warn-fg:#7a4a00;--bad:#c92a2a;--mid:#d9730d;--ok:#2b8a3e;--hi:#a61e4d;
 position:fixed;top:12px;right:12px;width:min(420px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:var(--bg);color:var(--fg);
 border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;z-index:2147483647}
@media (prefers-color-scheme:dark){.root{--bg:#17181c;--fg:#ececf1;--muted:#a1a1ad;--line:#30323a;--card:#1f2127;--accent:#8aa4ff;--warn-bg:#3a2c10;--warn-fg:#ffd591;--bad:#ff8787;--mid:#ffa94d;--ok:#69db7c;--hi:#faa2c1}}
.hdr{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
.hdr h1{font-size:14px;margin:0;flex:1;font-weight:650}
.iconbtn{all:unset;cursor:pointer;padding:4px 8px;border-radius:8px;color:var(--muted)}
.iconbtn:hover,.iconbtn:focus-visible{background:var(--card);color:var(--fg)}
.disclaimer{background:var(--warn-bg);color:var(--warn-fg);padding:8px 12px;font-size:12.5px;border-bottom:1px solid var(--line)}
.body{overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
button.primary{all:unset;cursor:pointer;background:var(--accent);color:#fff;padding:9px 14px;border-radius:10px;text-align:center;font-weight:600}
@media (prefers-color-scheme:dark){button.primary{color:#111}}
button.primary:focus-visible,.link:focus-visible,.iconbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.secondary{all:unset;cursor:pointer;padding:6px 10px;border:1px solid var(--line);border-radius:8px;font-size:12.5px}
button.secondary:hover{background:var(--card)}
.muted{color:var(--muted);font-size:12.5px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.score{display:flex;gap:12px;align-items:center}
.ring{width:84px;height:84px;flex:none}
.score .num{font-size:30px;font-weight:700;line-height:1}
.band{font-weight:650}
.band.low{color:var(--ok)}.band.medium{color:var(--mid)}.band.high{color:var(--bad)}.band.very_high{color:var(--hi)}
.banner{border-radius:12px;padding:10px 12px;border:1px solid}
.banner.warn{background:var(--warn-bg);color:var(--warn-fg);border-color:var(--mid)}
.banner.unsure{background:var(--card);border-color:var(--accent)}
.banner h2,.sec h2{font-size:13px;margin:0 0 6px;font-weight:650}
.banner ul{margin:0;padding-left:18px}
.finding{display:flex;flex-direction:column;gap:6px}
.finding .top{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.chip{font-size:11.5px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);font-weight:600}
.chip.high{color:var(--bad);border-color:var(--bad)}.chip.medium{color:var(--mid);border-color:var(--mid)}.chip.low{color:var(--muted)}
.cat{font-weight:650}
blockquote{margin:0;padding:6px 10px;border-left:3px solid var(--accent);background:var(--bg);font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.link{all:unset;cursor:pointer;color:var(--accent);font-size:12.5px;text-decoration:underline}
details{border:1px solid var(--line);border-radius:12px;padding:8px 12px}
details summary{cursor:pointer;font-weight:600;font-size:13px}
details .item{margin-top:8px}
.err{color:var(--bad)}
.bar{height:6px;background:var(--line);border-radius:6px;overflow:hidden}.bar>i{display:block;height:100%;background:var(--accent);width:0;transition:width .2s}
label.chk{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--muted)}
.meta{font-size:11.5px;color:var(--muted)}
`;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

function ring(score, bandKey) {
  const ns = 'http://www.w3.org/2000/svg';
  const r = 34, c = 2 * Math.PI * r;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 84 84'); svg.setAttribute('class', 'ring'); svg.setAttribute('aria-hidden', 'true');
  const mk = (stroke, dash) => {
    const circ = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: 42, cy: 42, r, fill: 'none', 'stroke-width': 9, stroke, 'stroke-linecap': 'round', transform: 'rotate(-90 42 42)', 'stroke-dasharray': `${dash} ${c}` })) circ.setAttribute(k, v);
    return circ;
  };
  const colors = { low: 'var(--ok)', medium: 'var(--mid)', high: 'var(--bad)', very_high: 'var(--hi)' };
  svg.append(mk('var(--line)', c), mk(colors[bandKey] || 'var(--accent)', (c * score) / 100));
  return svg;
}

/**
 * @param {object} o
 * @param {() => Promise<{configured:boolean,label:string,detected?:object}>} o.getStatus
 * @param {(opts:{useAgent:boolean,onProgress:(p:object)=>void}) => Promise<object>} o.analyze
 * @param {() => void} [o.openSettings]
 * @param {boolean} [o.showAgentToggle]
 */
export function mountOverlay({ getStatus, analyze, openSettings, showAgentToggle = true, win = window, doc = document }) {
  let host = doc.getElementById(HOST_ID);
  if (host) host.remove();
  host = doc.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const root = h('div', { class: 'root', role: 'dialog', 'aria-label': 'ToS Risk Lens', 'data-testid': 'overlay' });
  const body = h('div', { class: 'body', 'data-testid': 'body' });
  root.append(
    h('div', { class: 'hdr' }, h('h1', { text: 'ToS Risk Lens' }),
      openSettings ? h('button', { class: 'iconbtn', title: 'Ayarlar', 'aria-label': 'Ayarlar', onclick: () => openSettings(), text: '⚙' }) : null,
      h('button', { class: 'iconbtn', title: 'Kapat', 'aria-label': 'Kapat', 'data-testid': 'close', onclick: () => api.close(), text: '✕' })),
    h('div', { class: 'disclaimer', 'data-testid': 'disclaimer', role: 'note', text: DISCLAIMER_TR }),
    body);
  shadow.append(style, root);
  let useAgent = true;
  let lastReport = null;

  const setBody = (...nodes) => { body.replaceChildren(...nodes.flat().filter(Boolean)); };

  async function renderIdle() {
    let st = { configured: false, label: '' };
    try { st = await getStatus(); } catch { /* yoksay */ }
    const nodes = [];
    nodes.push(h('div', { class: 'muted', text: 'Bu sayfanın metni yalnızca sizin ayarladığınız LLM uç noktasına gönderilir. Üçüncü taraf sunucumuz yoktur.' }));
    if (st.detected) nodes.push(h('div', { class: 'card', 'data-testid': 'detected' }, st.detected.detected ? `Bu sayfa bir koşul/politika metni gibi görünüyor (${st.detected.kind}).` : 'Bu sayfa bir koşul/politika metni gibi görünmüyor; yine de analiz edebilirsiniz.'));
    if (!st.configured) {
      nodes.push(h('div', { class: 'banner warn', 'data-testid': 'not-configured' },
        h('h2', { text: 'LLM ayarı gerekli' }),
        h('div', { text: 'Kendi API anahtarınızı ve model uç noktanızı Ayarlar bölümünden girin. (page-agent’in demo LLM’i yalnızca deneme içindir; burada kullanılmaz.)' })));
    } else nodes.push(h('div', { class: 'meta', 'data-testid': 'model-label', text: `Model: ${st.label}` }));
    if (showAgentToggle) {
      const cb = h('input', { type: 'checkbox', checked: useAgent, 'data-testid': 'agent-toggle', onchange: (e) => { useAgent = e.target.checked; } });
      nodes.push(h('label', { class: 'chk' }, cb, h('span', { text: 'Katlanmış bölümleri page-agent ile aç (yalnızca “genişlet” türü tıklamalara izinli)' })));
    }
    nodes.push(h('button', { class: 'primary', 'data-testid': 'analyze-btn', onclick: run, text: 'Sayfayı analiz et' }));
    setBody(nodes);
  }

  async function run() {
    const fill = h('i');
    const label = h('div', { class: 'muted', 'data-testid': 'progress-label', text: 'Başlıyor…' });
    setBody(h('div', { class: 'card' }, label, h('div', { class: 'bar', style: 'margin-top:8px' }, fill)));
    const onProgress = (p) => {
      label.textContent = p.message || p.stage;
      if (p.total) fill.style.width = `${Math.round((100 * (p.done || 0)) / p.total)}%`;
      else fill.style.width = { agent: '15%', capture: '25%', sanitize: '35%', llm: '60%', verify: '90%', done: '100%' }[p.stage] || '30%';
    };
    try {
      lastReport = await analyze({ useAgent, onProgress });
      renderReport(lastReport);
    } catch (e) {
      setBody(h('div', { class: 'banner warn', 'data-testid': 'error' }, h('h2', { class: 'err', text: 'Analiz tamamlanamadı' }), h('div', { text: String(e?.message || e) })),
        h('button', { class: 'primary', onclick: renderIdle, text: 'Geri dön' }));
    }
  }

  function findingCard(f) {
    const shown = { v: null };
    const link = h('button', { class: 'link', 'data-testid': 'show-in-page', onclick: () => {
      const ok = highlightQuote(doc, win, f.quote);
      link.textContent = ok ? 'Sayfada gösterildi ✓' : 'Sayfada bulunamadı (metin değişmiş olabilir)';
    }, text: 'Sayfada göster' });
    return h('div', { class: 'card finding', 'data-testid': 'finding', 'data-category': f.category },
      h('div', { class: 'top' }, h('span', { class: `chip ${f.severity}`, text: f.severity_label }), h('span', { class: 'cat', text: f.category_label }),
        h('span', { class: 'meta', text: `Güven %${Math.round(f.confidence * 100)}` }), f.low_confidence ? h('span', { class: 'chip', 'data-testid': 'low-confidence', text: 'Düşük güven' }) : null),
      h('div', { 'data-testid': 'explanation', text: f.explanation_tr }),
      h('blockquote', { 'data-testid': 'quote', text: f.quote }), link);
  }

  function renderReport(r) {
    const nodes = [];
    nodes.push(h('div', { class: 'card score', 'data-testid': 'score-card' }, ring(r.risk.score, r.risk.band.key),
      h('div', {}, h('div', { class: 'num', 'data-testid': 'score', text: `${r.risk.score}/100` }),
        h('div', { class: `band ${r.risk.band.key}`, 'data-testid': 'band', text: `Risk: ${r.risk.band.label}` }),
        h('div', { class: 'meta', text: `${r.document_type_label_tr} · ${r.risk.verified_findings} doğrulanmış madde` }))));
    nodes.push(h('div', { 'data-testid': 'summary', text: r.summary_tr }));
    nodes.push(h('div', { class: 'meta', text: 'Skor yalnızca alıntısı doğrulanmış bulgulardan, sabit bir formülle hesaplanır; model skor üretmez.' }));

    if (r.security.integrity !== 'clean') {
      const items = r.security.removed.slice(0, 6).map((x) => h('li', {}, `${x.reason}${x.excerpt ? ': “' + x.excerpt + '”' : ''}`));
      nodes.push(h('div', { class: 'banner warn', 'data-testid': 'integrity-banner' },
        h('h2', { text: r.security.integrity === 'suspicious' ? '⚠ Sayfada yapay zekâya yönelik talimat bulundu' : 'Bilgi: bazı gizli/uzun metinler analize alınmadı' }),
        h('div', { text: r.security.integrity === 'suspicious' ? 'Bu metinler analizden çıkarıldı ve modele gönderilmedi. Sonuca ek şüpheyle yaklaşın.' : 'Gizli metinler modele gönderilmedi.' }), h('ul', {}, items)));
    }
    if (r.page_agent?.used) {
      const blocked = r.page_agent.blocked || [];
      nodes.push(h('div', { class: 'card meta', 'data-testid': 'agent-note' },
        `page-agent: ${r.page_agent.steps} adım, ${r.page_agent.clicked.length} bölüm açıldı, ${blocked.length} tıklama güvenlik kuralıyla engellendi.`,
        blocked.length ? h('ul', {}, blocked.map((b) => h('li', { 'data-testid': 'agent-blocked', text: `Engellendi (${b.reason}): ${b.label || '?'}` }))) : null));
    } else if (r.page_agent?.error) nodes.push(h('div', { class: 'meta', text: `page-agent kullanılamadı: ${r.page_agent.error}` }));

    if (r.uncertainties.length) {
      nodes.push(h('div', { class: 'banner unsure', 'data-testid': 'uncertainties' }, h('h2', { text: 'Emin olamadığımız noktalar' }),
        h('ul', {}, r.uncertainties.map((u) => h('li', { 'data-testid': 'uncertainty-item' }, h('b', { text: u.topic + ': ' }), u.reason_tr)))));
    }

    const sorted = [...r.findings].sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || (a.start - b.start));
    nodes.push(h('div', { class: 'sec' }, h('h2', { text: `Riskli maddeler (${sorted.length})` })));
    if (!sorted.length) nodes.push(h('div', { class: 'card muted', 'data-testid': 'no-findings', text: 'Alıntıyla doğrulanabilen riskli madde bulunamadı. Bu, belgenin risksiz olduğu anlamına gelmez.' }));
    for (const f of sorted) nodes.push(findingCard(f));

    if (r.unconfirmed_flags.length) {
      nodes.push(h('details', { 'data-testid': 'unconfirmed' }, h('summary', { text: `Doğrulanmamış işaretler (${r.unconfirmed_flags.length}) — skora dahil değil` }),
        h('div', { class: 'muted item', text: 'Kural motoru bu ifadeleri riskli olarak işaretledi; model doğrulamadı. Kendiniz okuyun.' }),
        r.unconfirmed_flags.map((u) => h('div', { class: 'item' }, h('div', { class: 'cat', text: u.category_label }), h('blockquote', { text: u.quote })))));
    }
    if (r.rejected_claims.length) {
      nodes.push(h('details', { 'data-testid': 'rejected' }, h('summary', { text: `Reddedilen model iddiaları (${r.rejected_claims.length})` }),
        h('div', { class: 'muted item', text: 'Alıntısı sayfada bulunamayan iddialar geçersiz sayılır ve skora girmez.' }),
        r.rejected_claims.map((c) => h('div', { class: 'item' }, h('blockquote', { 'data-testid': 'rejected-quote', text: c.quote || '(alıntı yok)' }), h('div', { class: 'meta', text: c.reasons.map(reasonTr).join(' · ') })))));
    }
    nodes.push(h('div', { class: 'meta', 'data-testid': 'meta', text: `Model: ${r.meta.model} · ${r.source.chars_analyzed.toLocaleString('tr-TR')} karakter · ${r.meta.chunks} parça · ${(r.meta.duration_ms / 1000).toFixed(1)} sn` }));
    nodes.push(h('div', { style: 'display:flex;gap:8px' },
      h('button', { class: 'secondary', 'data-testid': 'download-json', onclick: () => download(r), text: 'JSON indir' }),
      h('button', { class: 'secondary', 'data-testid': 'reanalyze', onclick: renderIdle, text: 'Yeniden analiz' })));
    setBody(nodes);
  }

  function download(r) {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'tos-risk-raporu.json' });
    doc.body.appendChild(a); a.click(); a.remove();
  }

  const api = {
    host,
    open() { if (!host.isConnected) doc.documentElement.appendChild(host); renderIdle(); },
    close() { host.remove(); },
    toggle() { host.isConnected ? api.close() : api.open(); },
    get report() { return lastReport; },
    run,
  };
  return api;
}
