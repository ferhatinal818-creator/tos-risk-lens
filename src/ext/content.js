// Content script: yalnızca yerel tespit yapar; metin kullanıcı "Analiz et"e basana kadar HİÇBİR yere gönderilmez.
import { mountOverlay } from '../ui/overlay.js';
import { analyzePage, detectHere } from './run.js';

if (!window.__tosRiskLens) {
  window.__tosRiskLens = true;
  const send = (m) => chrome.runtime.sendMessage(m);
  let detected = null;

  const overlay = mountOverlay({
    getStatus: async () => ({ ...(await send({ type: 'get-status' })).status, detected }),
    analyze: async ({ useAgent, onProgress }) => {
      const { status } = await send({ type: 'get-status' });
      if (!status.configured) throw new Error('Önce Ayarlar bölümünden LLM uç noktası, model ve API anahtarınızı girin.');
      return analyzePage({ send, status, useAgent, onProgress });
    },
    openSettings: () => send({ type: 'open-options' }),
  });

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type === 'toggle') overlay.toggle();
  });

  try {
    detected = detectHere();
    if (detected.detected) send({ type: 'detected', detected: true });
  } catch { /* tespit başarısızsa sessiz kal */ }
}
