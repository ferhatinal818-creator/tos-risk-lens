// Uzantı ve demo harness'ın ORTAK akışı: (opsiyonel page-agent açma) -> yakala -> analiz et.
// Taşıma (send) enjekte edilir: uzantıda chrome.runtime.sendMessage, harness'ta fetch.
import { captureDocument } from '../core/capture.js';
import { analyzeDocument } from '../core/pipeline.js';
import { detectLegalPage } from '../core/detect.js';
import { expandWithAgent, hasCollapsed } from './agent.js';

export function detectHere(doc = document, win = window) {
  const cap = captureDocument(doc, win);
  const headings = [...doc.querySelectorAll('h1,h2')].slice(0, 6).map((h) => h.textContent).join(' ');
  return detectLegalPage({ url: win.location.href, title: doc.title, headings, text: cap.text });
}

export async function analyzePage({ send, status, useAgent, onProgress = () => {}, doc = document, win = window }) {
  let pageAgent = { used: false };
  // 1) deterministik açma: <details>
  doc.querySelectorAll('details:not([open])').forEach((d) => d.setAttribute('open', ''));
  // 2) page-agent: yalnızca geriye açılacak bir şey kaldıysa
  if (useAgent && hasCollapsed(doc)) {
    pageAgent = await expandWithAgent({ send, model: status.label || 'configured', onProgress });
  }
  onProgress({ stage: 'capture', message: 'Sayfa metni yakalanıyor' });
  const capture = captureDocument(doc, win);
  const llm = async (messages, { schema } = {}) => {
    const r = await send({ type: 'llm', messages, schema });
    if (!r?.ok) throw new Error(r?.error || 'LLM hatası');
    return r.content;
  };
  const report = await analyzeDocument({ capture, llm, model: status.label || 'bilinmiyor', onProgress });
  report.page_agent = pageAgent;
  return report;
}
