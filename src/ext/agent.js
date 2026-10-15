// page-agent entegrasyonu: yalnızca "katlanmış bölümleri aç" görevi, SERT kısıtlarla.
//  - araçlar: input_text/select/js/ask_user/yatay kaydırma KALDIRILDI; tıklama deterministik koruma geçer
//  - modele giden sayfa içeriği, injection filtresinden geçer (transformPageContent)
//  - görev metnini sayfa değil biz yazarız; adım sayısı sınırlı; LLM çağrısı arka plandan (anahtar sayfada yok)
import { PageAgent, tool } from 'page-agent';
import { z } from 'zod/v4';
import { isClickAllowed, describeElement, REMOVED_TOOLS, AGENT_TASK, AGENT_SYSTEM } from '../core/agent-guard.js';
import { sanitizeCapture } from '../core/injection.js';

/** Sayfa bağlamından (CORS'a takılmadan) arka plan üzerinden giden fetch. */
export function makeProxyFetch(send) {
  return async function proxyFetch(url, init) {
    if (!String(url).endsWith('/chat/completions') || (init?.method || 'GET').toUpperCase() !== 'POST') throw new Error('yalnızca chat/completions');
    const r = await send({ type: 'llm-proxy', body: typeof init.body === 'string' ? init.body : String(init.body) });
    if (!r?.ok) throw new Error(r?.error || 'LLM proxy hatası');
    return new Response(r.text, { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}

export const hasCollapsed = (doc) =>
  !!doc.querySelector('[aria-expanded="false"], details:not([open]) > summary') ||
  [...doc.querySelectorAll('button, a[role="button"], [role="button"]')].some((b) => /show more|read more|read full|expand|devam|tamamını|daha fazla/i.test(b.textContent || ''));

/**
 * @returns {Promise<{used:boolean, steps:number, clicked:string[], blocked:{reason:string,label:string}[], error?:string}>}
 */
export async function expandWithAgent({ send, model = 'configured', onProgress = () => {}, maxSteps = 8 }) {
  const info = { used: false, steps: 0, clicked: [], blocked: [] };
  const tools = Object.fromEntries(REMOVED_TOOLS.map((n) => [n, null]));

  tools.click_element_by_index = tool({
    description: 'Click an element by its index. ONLY allowed for controls that expand collapsed text sections (accordions, "show more", "read full terms"). Everything else is blocked by a safety policy.',
    inputSchema: z.object({ index: z.int().min(0) }),
    execute: async function (input) {
      const node = this.pageController.selectorMap?.get(input.index);
      const el = node?.ref;
      if (!el) return `❌ No element with index ${input.index}.`;
      const desc = describeElement(el, location.href);
      const verdict = isClickAllowed(desc);
      const label = (desc.text || desc.ariaLabel || desc.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!verdict.allow) {
        info.blocked.push({ reason: verdict.reason, label });
        return `❌ Blocked by safety policy (${verdict.reason}). Only expand/collapse controls may be clicked. Do not try other elements that trigger actions; call done if nothing else needs expanding.`;
      }
      const r = await this.pageController.clickElement(input.index);
      info.clicked.push(label);
      return r.message;
    },
  });

  const agent = new PageAgent({
    baseURL: 'https://llm-proxy.invalid/v1', // kullanılmaz: customFetch arka plana yönlendirir
    model,
    apiKey: 'none', // gerçek anahtar yalnızca arka planda
    customFetch: makeProxyFetch(send),
    language: 'en-US',
    maxSteps,
    customTools: tools,
    experimentalScriptExecutionTool: false,
    instructions: { system: AGENT_SYSTEM },
    transformPageContent: (content) => sanitizeCapture({ text: content, hidden: [] }).cleanText,
    promptForNextTask: false,
  });

  try {
    onProgress({ stage: 'agent', message: 'page-agent katlanmış bölümleri açıyor…' });
    const result = await agent.execute(AGENT_TASK);
    info.used = true;
    info.steps = (result.history || []).filter((e) => e.type === 'step').length;
    if (!result.success && /exceeded|error/i.test(result.data || '')) info.error = String(result.data).slice(0, 160);
  } catch (e) {
    info.error = String(e?.message || e).slice(0, 160);
  } finally {
    try { agent.dispose(); } catch { /* yoksay */ }
  }
  return info;
}
