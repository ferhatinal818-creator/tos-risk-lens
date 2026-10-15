import { loadConfig, saveConfig } from './config.js';
import { makeLLM } from '../core/llm.js';

const $ = (id) => document.getElementById(id);
const msg = (t, cls = '') => { $('msg').textContent = t; $('msg').className = cls; };

async function ensureHostPermission(baseURL) {
  const u = new URL(baseURL);
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true; // manifestte zaten var
  const origins = [`${u.origin}/*`];
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins }); // yalnızca bu uç nokta için, kullanıcı onayıyla
}

(async () => {
  const c = await loadConfig();
  $('baseURL').value = c.baseURL; $('model').value = c.model; $('apiKey').value = c.apiKey;
  $('preset').addEventListener('change', (e) => {
    const [u, m] = e.target.value.split('|');
    if (u) { $('baseURL').value = u; $('model').value = m; }
  });
  const read = () => ({ baseURL: $('baseURL').value, model: $('model').value, apiKey: $('apiKey').value });

  $('save').addEventListener('click', async () => {
    const cfg = read();
    try {
      if (!/^https?:\/\//.test(cfg.baseURL)) throw new Error('Uç nokta http(s):// ile başlamalı');
      if (!cfg.model.trim()) throw new Error('Model adı gerekli');
      if (!(await ensureHostPermission(cfg.baseURL))) throw new Error('Uç nokta için izin verilmedi');
      await saveConfig(cfg);
      msg('Kaydedildi.', 'ok');
    } catch (e) { msg(e.message, 'bad'); }
  });

  $('test').addEventListener('click', async () => {
    const cfg = read();
    msg('Deneniyor…');
    try {
      if (!(await ensureHostPermission(cfg.baseURL))) throw new Error('Uç nokta için izin verilmedi');
      const llm = makeLLM({ baseURL: cfg.baseURL.trim().replace(/\/+$/, ''), apiKey: cfg.apiKey.trim(), model: cfg.model.trim(), timeoutMs: 30000 });
      const out = await llm([{ role: 'user', content: 'Reply with the single word: ok' }]);
      msg(`Bağlantı çalışıyor (yanıt: ${out.slice(0, 40)})`, 'ok');
    } catch (e) { msg(`Hata: ${e.message}${e.status ? ' HTTP ' + e.status : ''}`, 'bad'); }
  });
})();
