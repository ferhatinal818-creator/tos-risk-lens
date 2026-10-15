// LLM ayarı: yalnızca arka plan servisinde ve ayarlar sayfasında okunur. Anahtar content script'e / sayfaya HİÇ gitmez.
export const DEFAULT_CONFIG = { baseURL: '', model: '', apiKey: '' };

export async function loadConfig() {
  const { llm } = await chrome.storage.local.get('llm');
  return { ...DEFAULT_CONFIG, ...(llm || {}) };
}
export async function saveConfig(cfg) {
  await chrome.storage.local.set({ llm: { baseURL: cfg.baseURL.trim().replace(/\/+$/, ''), model: cfg.model.trim(), apiKey: cfg.apiKey.trim() } });
}
export const isConfigured = (c) => !!(c.baseURL && c.model);

/** Sayfaya/content script'e gidebilecek, anahtarsız özet. */
export function publicStatus(c) {
  let host = '';
  try { host = new URL(c.baseURL).host; } catch { /* yoksay */ }
  return { configured: isConfigured(c), label: isConfigured(c) ? `${c.model} @ ${host}` : '' };
}
