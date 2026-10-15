// Prompt-injection savunmasının deterministik katmanı (LLM'e gitmeden ÖNCE çalışır).
//  - Gizli (görünmeyen) metin modele HİÇ gönderilmez; sayılır ve raporlanır.
//  - Görünür metindeki yapay-zekâya-hitap eden / talimat benzeri cümleler modele gitmeden çıkarılır (yer tutucu konur).
//  - Görünmez Unicode ("ASCII smuggling", tag karakterleri, sıfır genişlik) temizlenir ve bayraklanır.
// Not: bu bir "kesin filtre" değil, derinlemesine savunmanın bir halkasıdır; kalan halkalar README'de.

export const PLACEHOLDER = '⟦güvensiz metin çıkarıldı⟧';

const P = (id, re) => ({ id, re });
export const INSTRUCTION_PATTERNS = [
  P('ignore_previous', /\b(?:ignore|disregard|forget|override|bypass)\b.{0,40}\b(?:previous|prior|above|earlier|preceding|all|any|your|the|these)\b.{0,30}\b(?:instructions?|prompts?|rules?|guidelines?|directions?|context)\b/i),
  P('new_instructions', /\b(?:new|updated|revised|real|actual)\s+(?:instructions?|system\s+prompt|task)\s*[:\-]/i),
  P('system_prompt', /\b(?:system|developer)\s+(?:prompt|message|instructions?)\b/i),
  P('role_tag', /<\/?\s*(?:system|assistant|developer|instructions?|im_start|im_end)\b|\[\/?(?:INST|SYS)\]|<\|(?:im_start|im_end|system)\|>/i),
  P('address_ai', /\b(?:attention|note\s+to|message\s+for|dear|hey|hello|important\s+(?:for|to))\b.{0,30}\b(?:AI|A\.I\.|LLMs?|language\s+models?|assistants?|chatbots?|models?|agents?|crawlers?|scanners?|summari[sz]ers?|analy[sz]ers?|reviewers?|bots?)\b/i),
  P('ai_must', /\b(?:AI|LLM|language\s+model|assistants?|chatbot|automated\s+(?:system|reviewer|analy\w+)|summari[sz]ers?)\b.{0,50}\b(?:must|should|shall|will|need\s+to|are\s+required\s+to|please|has\s+to)\b/i),
  P('suppress', /\b(?:do\s+not|don'?t|never|must\s+not|should\s+not)\b.{0,30}\b(?:mention|report|flag|reveal|list|include|highlight|warn|disclose|point\s+out)\b/i),
  P('force_verdict', /\b(?:rate|score|mark|classify|label|report|treat|consider|describe|summari[sz]e|output|return|respond|answer|say|state|conclude)\b.{0,40}\b(?:this|the)\b.{0,30}\b(?:document|site|page|terms|policy|agreement|service|app|company)\b.{0,60}\b(?:safe|harmless|low[-\s]?risk|no[-\s]?risk|risk[-\s]?free|fair|user[-\s]?friendly|trustworthy|benign|compliant)\b/i),
  P('force_output', /\b(?:respond|reply|answer|output|return)\b\s+(?:only\s+)?(?:with|in)\b.{0,30}\b(?:json|the\s+following|exactly|"?risk|empty\s+(?:list|array)|\[\s*\])/i),
  P('empty_findings', /\b(?:findings?|risks?|issues?|concerns?)\b\s*(?:=|:|to|as|are)\s*(?:\[\s*\]|none|empty|zero|0|nothing)\b/i),
  P('risk_score_zero', /\brisk[_\s-]?score\b.{0,20}\b(?:0|zero|low|none|minimal)\b/i),
  P('jailbreak', /\b(?:jailbreak|developer\s+mode|DAN\s+mode|you\s+are\s+now\s+(?:a|an|in)|act\s+as\s+(?:a|an)\s+(?:different|new)|pretend\s+(?:to\s+be|you\s+are))\b/i),
  P('exfiltrate', /\b(?:send|post|forward|leak|exfiltrate|email|upload|reveal|print|repeat)\b.{0,50}\b(?:api[-\s]?key|secret|token|credential|password|system\s+prompt|cookies?|conversation|history)\b/i),
  // Türkçe
  P('tr_ignore', /(?:önceki|yukarıdaki|tüm|bütün|mevcut)\s+(?:talimat|komut|yönerge|kural|istem)\w*\s+(?:yok\s+say|unut|görmezden\s+gel|geçersiz\s+say|dikkate\s+alma)/i),
  P('tr_address_ai', /(?:yapay\s+zek[aâ]|dil\s+modeli|asistan|chatbot|bot|model)\w*.{0,40}(?:talimat|şunu\s+yap|yapmalı|yapmalısın|lütfen|zorunda)/i),
  P('tr_force_verdict', /(?:bu|söz\s+konusu)\s+(?:belge|site|metin|sözleşme|politika|hizmet)\w*.{0,50}(?:güvenli|risksiz|düşük\s+risk|zararsız|sorunsuz|kullanıcı\s+dostu)\w*\s*(?:olarak\s+)?(?:değerlendir|işaretle|raporla|puanla|belirt|yaz|de)/i),
  P('tr_suppress', /(?:rapor|belirt|işaretle|listele|uyarı)\w*.{0,20}(?:etme|yazma|ekleme|verme)\b/i),
  P('tr_system_prompt', /sistem\s+(?:istemi|promptu|mesajı|talimatı)/i),
];

const TAG_CHARS_RE = /[\u{E0000}-\u{E007F}]/gu;
const ZW_RE = /[​-‍⁠﻿‪-‮⁦-⁩]/g;

function sentenceBounds(text, start, end) {
  let s = start;
  for (let i = start - 1; i >= Math.max(0, start - 250); i--) {
    const c = text[i];
    s = i + 1;
    if (c === '\n' || ((c === '.' || c === '!' || c === '?') && /\s/.test(text[i + 1] || ''))) break;
    s = i;
  }
  let e = end;
  for (let i = end; i < Math.min(text.length, end + 250); i++) {
    e = i + 1;
    const c = text[i];
    if (c === '\n') { e = i; break; }
    if ((c === '.' || c === '!' || c === '?') && /\s/.test(text[i + 1] || ' ')) break;
  }
  return [s, e];
}

/** @returns {{id:string,start:number,end:number,match:string}[]} (cümle sınırına genişletilmiş, birleştirilmiş) */
export function scanInstructionLike(text) {
  const spans = [];
  for (const { id, re } of INSTRUCTION_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(text))) {
      if (!m[0].length) { g.lastIndex++; continue; }
      const [s, e] = sentenceBounds(text, m.index, m.index + m[0].length);
      spans.push({ id, start: s, end: e, match: m[0].slice(0, 120) });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp.start <= last.end) { last.end = Math.max(last.end, sp.end); last.ids.add(sp.id); }
    else merged.push({ ...sp, ids: new Set([sp.id]) });
  }
  return merged.map((m) => ({ id: [...m.ids].join('+'), start: m.start, end: m.end, match: m.match }));
}

const excerpt = (s, n = 160) => (s.length > n ? s.slice(0, n) + '…' : s).replace(/\s+/g, ' ').trim();

/**
 * @param {{text:string, hidden?:{reason:string,text:string}[]}} capture
 * @returns {{cleanText:string, removed:object[], integrity:'clean'|'notice'|'suspicious', stats:object}}
 */
export function sanitizeCapture(capture) {
  const removed = [];
  let text = capture.text || '';

  // 1) Görünmez Unicode
  const tagCount = (text.match(TAG_CHARS_RE) || []).length;
  const zwCount = (text.match(ZW_RE) || []).length;
  if (tagCount) { removed.push({ kind: 'invisible_chars', reason: `Unicode tag karakterleri (${tagCount})`, excerpt: '' }); text = text.replace(TAG_CHARS_RE, ''); }
  if (zwCount >= 5) removed.push({ kind: 'invisible_chars', reason: `Sıfır genişlikli karakterler (${zwCount})`, excerpt: '' });

  // 2) Görünür metindeki talimat benzeri cümleler -> yer tutucu
  const spans = scanInstructionLike(text);
  if (spans.length) {
    let out = '';
    let pos = 0;
    for (const sp of spans) {
      out += text.slice(pos, sp.start) + PLACEHOLDER;
      pos = sp.end;
      removed.push({ kind: 'visible_instruction', reason: `Talimat benzeri görünür metin (${sp.id})`, excerpt: excerpt(text.slice(sp.start, sp.end)) });
    }
    text = out + text.slice(pos);
  }

  // 3) Gizli metin: modele gitmez; talimat benzeri ise "suspicious", uzun ve sıradan ise "notice"
  let hiddenChars = 0;
  let hiddenInstr = 0;
  for (const h of capture.hidden || []) {
    hiddenChars += h.text.length;
    const hit = scanInstructionLike(h.text);
    if (hit.length) {
      hiddenInstr++;
      removed.push({ kind: 'hidden_instruction', reason: `Gizli (${h.reason}) talimat benzeri metin`, excerpt: excerpt(h.text) });
    } else if (h.text.length > 200) {
      removed.push({ kind: 'hidden_text', reason: `Gizli (${h.reason}) uzun metin; analize alınmadı`, excerpt: excerpt(h.text) });
    }
  }

  const suspicious = removed.some((r) => ['visible_instruction', 'hidden_instruction', 'invisible_chars'].includes(r.kind) && !(r.kind === 'invisible_chars' && !tagCount));
  const notice = removed.length > 0;
  return {
    cleanText: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    removed,
    integrity: suspicious ? 'suspicious' : notice ? 'notice' : 'clean',
    stats: { visibleInstructionSpans: spans.length, hiddenSegments: (capture.hidden || []).length, hiddenChars, hiddenInstr, tagCount, zwCount },
  };
}
