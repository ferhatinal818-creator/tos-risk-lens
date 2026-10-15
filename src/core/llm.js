// OpenAI-uyumlu /chat/completions istemcisi (kendi anahtarınızı kullanırsınız; demo LLM YOK).
// fetchImpl enjekte edilir: uzantıda service worker'ın fetch'i, testlerde sahte.
export class LLMError extends Error {
  constructor(message, { status, body } = {}) { super(message); this.name = 'LLMError'; this.status = status; this.body = body; }
}

export function makeLLM({ baseURL, apiKey, model, fetchImpl = globalThis.fetch, timeoutMs = 90000, temperature, extraBody } = {}) {
  if (!baseURL || !model) throw new LLMError('baseURL ve model gerekli');
  const url = baseURL.replace(/\/+$/, '') + '/chat/completions';
  // 1) json_schema (strict)  2) json_object  3) düz metin — sağlayıcı reddederse kademeli geri düşme
  const modes = ['json_schema', 'json_object', 'plain'];
  let modeIdx = 0;

  return async function llm(messages, { schema, signal } = {}) {
    for (; modeIdx < modes.length; modeIdx++) {
      const mode = modes[modeIdx];
      const body = { model, messages, ...(temperature != null ? { temperature } : {}), ...(extraBody || {}) };
      if (mode === 'json_schema' && schema) body.response_format = { type: 'json_schema', json_schema: { name: 'tos_risk_report', strict: true, schema } };
      else if (mode === 'json_object') body.response_format = { type: 'json_object' };

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch (e) {
        throw new LLMError(e.name === 'AbortError' ? 'LLM isteği zaman aşımına uğradı' : `LLM isteği başarısız: ${e.message}`);
      } finally { clearTimeout(timer); }

      const text = await res.text();
      if (!res.ok) {
        const formatProblem = (res.status === 400 || res.status === 422) && /response_format|json_schema|json_object|schema/i.test(text);
        if (formatProblem && modeIdx < modes.length - 1) continue;
        throw new LLMError(`LLM HTTP ${res.status}`, { status: res.status, body: text.slice(0, 500) });
      }
      let data;
      try { data = JSON.parse(text); } catch { throw new LLMError('LLM yanıtı JSON değil', { body: text.slice(0, 300) }); }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new LLMError('LLM boş yanıt döndürdü', { body: text.slice(0, 300) });
      return content;
    }
    throw new LLMError('LLM biçim modları tükendi');
  };
}
