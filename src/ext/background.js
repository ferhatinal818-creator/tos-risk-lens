// MV3 service worker: LLM çağrılarının TEK çıkış noktası. Anahtar burada kalır.
// content script yalnızca şu mesajları gönderebilir: get-status | llm | llm-proxy | open-options | detected.
import { loadConfig, publicStatus, isConfigured } from './config.js';
import { makeLLM } from '../core/llm.js';

const CHAT_PATH = '/chat/completions';

async function handle(msg, sender) {
  switch (msg?.type) {
    case 'get-status':
      return { ok: true, status: publicStatus(await loadConfig()) };

    case 'llm': { // yapılandırılmış analiz çağrısı (araç yok)
      const cfg = await loadConfig();
      if (!isConfigured(cfg)) return { ok: false, error: 'LLM ayarı yapılmamış (Ayarlar sayfasından girin).' };
      if (!Array.isArray(msg.messages) || msg.messages.length > 6) return { ok: false, error: 'geçersiz istek' };
      try {
        const llm = makeLLM({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, model: cfg.model });
        return { ok: true, content: await llm(msg.messages, { schema: msg.schema }) };
      } catch (e) {
        return { ok: false, error: `${e.message}${e.status ? ` (HTTP ${e.status})` : ''}` };
      }
    }

    case 'llm-proxy': { // page-agent'ın kendi istek gövdesi; yalnızca yapılandırılmış uç noktanın /chat/completions yolu
      const cfg = await loadConfig();
      if (!isConfigured(cfg)) return { ok: false, error: 'LLM ayarı yok' };
      let body;
      try { body = JSON.parse(msg.body); } catch { return { ok: false, error: 'geçersiz gövde' }; }
      body.model = cfg.model; // sayfa/agent model adını değiştiremez
      const res = await fetch(cfg.baseURL + CHAT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify(body),
      });
      return { ok: true, status: res.status, text: await res.text() };
    }

    case 'open-options':
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    case 'detected': {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        await chrome.action.setBadgeText({ tabId, text: msg.detected ? 'ToS' : '' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b5bdb' });
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: 'bilinmeyen mesaj' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false; // başka uzantı/sayfa gönderemez
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  } catch {
    // content script yok (uzantı kurulmadan önce açılmış sekme): enjekte et ve tekrar dene
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    } catch { /* chrome:// vb. sayfalar */ }
  }
});
