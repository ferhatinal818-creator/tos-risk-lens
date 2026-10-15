// Demo/Cypress harness: uzantıdaki content script ile AYNI arayüz ve akış (src/ui + src/ext/run).
// Tek fark taşıma katmanı: chrome.runtime yerine yerel sunucuya fetch (anahtar tarayıcı kodunda yok; mock uç nokta anahtar istemez).
import { mountOverlay } from '../src/ui/overlay.js';
import { analyzePage, detectHere } from '../src/ext/run.js';
import { makeLLM } from '../src/core/llm.js';

const BASE = `${location.origin}/v1`;
const MODEL = 'mock-llm (demo)';
const status = { configured: true, label: MODEL };

async function send(m) {
  if (m.type === 'llm') {
    try { return { ok: true, content: await makeLLM({ baseURL: BASE, model: 'mock', timeoutMs: 30000 })(m.messages, { schema: m.schema }) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  if (m.type === 'llm-proxy') {
    const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: m.body });
    return { ok: true, status: r.status, text: await r.text() };
  }
  return { ok: true, status };
}

const detected = detectHere();
const overlay = mountOverlay({
  getStatus: async () => ({ ...status, detected }),
  analyze: ({ useAgent, onProgress }) => analyzePage({ send, status, useAgent, onProgress }),
});
window.__overlay = overlay;
overlay.open();
