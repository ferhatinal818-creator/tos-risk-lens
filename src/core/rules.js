// Deterministik "tripwire" kural motoru (EN + TR).
// Üç görevi var:
//   1) Çapraz kontrol: model bir maddeyi kaçırırsa (veya injection ile susturulursa) bunu yakalar.
//   2) Eval'de LLM'siz taban çizgisi (baseline).
//   3) Model devre dışıyken bile "doğrulanmamış işaret" üretir.
// Kasıtlı olarak yüksek duyarlılık / düşük kesinlik: çıktısı skora DAHİL EDİLMEZ, "doğrulanmamış işaret" olarak gösterilir.

const R = (category, severity, ...patterns) => ({ category, severity, patterns });

export const RULES = [
  R('auto_renewal', 'high',
    /\b(?:automatically|auto-?)\s*renew/i, /\brenews?\s+(?:automatically|for\s+(?:successive|additional|another|the same))/i,
    /\buntil\s+you\s+cancel/i, /\bunless\s+you\s+cancel\b/i, /\brecurring\s+(?:billing|payments?|subscriptions?|charges?)/i,
    /otomatik\s+(?:olarak\s+)?(?:yenilen|uzat)/i, /iptal\s+edene\s+kadar/i),
  R('fee_change', 'medium',
    /\b(?:change|modify|adjust|increase|revise)\s+(?:the\s+|our\s+|its\s+)?(?:prices?|fees?|pricing|subscription\s+fees?)/i,
    /\bprice\s+(?:increases?|changes?)\b/i,
    /(?:fiyat|ücret)(?:ler)?(?:i|in)?\b.{0,40}(?:değiştir|artır|güncelle)/i),
  R('no_refund', 'medium',
    /\bnon-?refundable\b/i, /\bno\s+refunds?\b/i, /\b(?:will|do|does)\s+not\s+(?:provide|issue|give|offer)\s+(?:any\s+)?refunds?\b/i,
    /iade\s+(?:edilmez|yapılmaz|söz\s+konusu\s+değil)/i, /ücret\s+iadesi\s+(?:yapılmaz|yoktur)/i),
  R('unilateral_change', 'medium',
    /\b(?:we|company|spotify|you)?\s*(?:may|can|reserve\s+the\s+right\s+to)\s+(?:modify|change|update|revise|amend)\s+(?:these|the|this|our)\s+(?:terms|agreement|policy|policies)/i,
    /\breserve\s+the\s+right\s+to\s+(?:modify|change|amend|update|revise)\b/i,
    /\bat\s+any\s+time\b.{0,60}\b(?:modify|change|update|revise)\b.{0,40}\b(?:terms|agreement|policy)/i,
    /(?:değiştirme|güncelleme)\s+hakkını\s+saklı\s+tutar/i, /tek\s+taraflı(?:\s+olarak)?\s+(?:değiştir|güncelle)/i),
  R('account_termination', 'medium',
    /\b(?:suspend|terminate|disable|deactivate|remove|delete)\b.{0,80}\b(?:account|access|content)\b.{0,80}\b(?:at\s+any\s+time|without\s+(?:prior\s+)?notice|sole\s+discretion|for\s+any\s+reason|in\s+our\s+discretion)/i,
    /\b(?:at\s+any\s+time|without\s+(?:prior\s+)?notice|sole\s+discretion)\b.{0,100}\b(?:suspend|terminate|disable|remove|delete)\b/i,
    /hesab(?:ı|ınızı)\b.{0,50}(?:askıya\s+al|kapat|sonlandır|sil)/i),
  R('arbitration_class_waiver', 'high',
    /\bbinding\s+arbitration\b/i, /\barbitration\b.{0,100}\b(?:individual|class|waive|waiver|instead\s+of\s+(?:a\s+)?court)/i,
    /\bclass[-\s]action\s+waiver\b/i, /\bwaive\b.{0,80}\b(?:class|jury|court)\b/i, /\bjury\s+trial\b/i,
    /\bagree\s+to\s+(?:resolve|settle)\b.{0,60}\barbitration\b/i,
    /\btahkim\b/i, /toplu\s+dava/i),
  R('liability_limitation', 'medium',
    /\bin\s+no\s+event\b.{0,160}\bliab/i, /\bunder\s+no\s+circumstances\b.{0,160}\bliab/i,
    /\bto\s+the\s+(?:fullest|maximum)\s+extent\b.{0,120}\b(?:liab|disclaim|exclud)/i,
    /\blimitation\s+of\s+liability\b/i, /\bas[-\s]is\b.{0,40}\bas[-\s]available\b/i, /\bdisclaim(?:s|er)?\b.{0,40}\bwarrant/i,
    /sorumlu\s+(?:tutulamaz|olmayacaktır|değildir)/i, /sorumluluğunu\s+(?:kabul\s+etmez|sınırl)/i),
  R('indemnification', 'medium',
    /\bindemnif(?:y|ies|ication)\b/i, /\bhold\b.{0,40}\bharmless\b/i, /\btazmin\b/i),
  R('jurisdiction', 'low',
    /\bgoverned\s+by\b.{0,60}\blaws?\s+of\b/i, /\bconstrued\s+in\s+accordance\s+with\b.{0,60}\blaws?\b/i,
    /\bexclusive\s+(?:jurisdiction|venue)\b/i, /\bsubmit\s+to\b.{0,60}\bjurisdiction\b/i,
    /yetkili\s+(?:mahkeme|icra)/i, /uygulanacak\s+hukuk/i),
  R('data_sharing', 'high',
    /\b(?:sell|sale\s+of|selling)\b.{0,50}\b(?:personal|your)\s+(?:data|information)/i,
    /\bshare\b.{0,80}\b(?:with|to)\s+(?:third[-\s]part|advertis|(?:our\s+)?partners|affiliates|business\s+partners)/i,
    /\b(?:disclose|provide|make\s+available)\b.{0,60}\b(?:third[-\s]part|advertis)/i,
    /üçüncü\s+(?:kişi|taraf)(?:lar)?(?:la|lara|larla)?\b.{0,50}paylaş/i, /kişisel\s+(?:veri|bilgi)(?:ler)?(?:i|iniz)?\b.{0,40}\bsat/i),
  R('data_collection_tracking', 'medium',
    /\b(?:we|spotify)?\s*(?:collect|track|monitor|record|infer)\b.{0,80}\b(?:precise\s+location|geolocation|location\s+data|browsing\s+(?:history|activity)|contacts|address\s+book|keystrokes?|biometric|face|voice|device\s+identifiers?|advertising\s+id)/i,
    /\bcross[-\s](?:site|device|context)\s+track/i, /\bprofil(?:e|ing)\b.{0,60}\b(?:interests|behavio|advertis)/i,
    /(?:konum|çerez|tarama\s+geçmişi|rehber).{0,50}(?:topla|kaydet|izle)/i),
  R('data_retention', 'medium',
    /\b(?:retain|keep|store|preserve)\b.{0,80}\b(?:as\s+long\s+as\s+(?:necessary|needed)|indefinitely|even\s+after|after\s+(?:you\s+)?(?:delete|close|terminate))/i,
    /\bindefinite(?:ly)?\b/i, /süresiz\s+(?:olarak\s+)?sakla/i),
  R('content_license', 'high',
    /\b(?:worldwide|perpetual|irrevocable|royalty[-\s]free|sublicens\w*|transferable)\b.{0,100}\blicen[sc]e/i,
    /\blicen[sc]e\b.{0,120}\b(?:worldwide|perpetual|irrevocable|royalty[-\s]free|sublicens|transferable)/i,
    /(?:dünya\s+çapında|süresiz|devredilebilir|alt\s+lisans).{0,80}lisans/i),
  R('ai_training_use', 'high',
    /\b(?:machine\s+learning|artificial\s+intelligence|generative\s+ai|\bAI\b)\b.{0,100}\b(?:train|training|models?)\b/i,
    /\b(?:train|training)\b.{0,80}\b(?:machine\s+learning|artificial\s+intelligence|\bAI\b|models?)\b/i,
    /yapay\s+zek[aâ].{0,80}(?:eğit|geliştir)/i),
  R('consent_by_use', 'low',
    /\bby\s+(?:using|accessing|continuing\s+to\s+use|visiting)\b.{0,100}\b(?:you\s+)?(?:agree|accept|consent|acknowledge)/i,
    /\bcontinued\s+use\b.{0,80}\b(?:constitutes|means|indicates)\b/i,
    /(?:kullanarak|erişerek|devam\s+ederek).{0,60}(?:kabul\s+etmiş|onaylamış|kabul\s+edersiniz)/i),
];

const SENT_BREAK = /[.!?]\s|\n/g;

function expandToSentence(text, start, end, cap = 420) {
  let s = start;
  const lo = Math.max(0, start - 300);
  for (let i = start - 1; i >= lo; i--) {
    const c = text[i];
    if (c === '\n' || ((c === '.' || c === '!' || c === '?') && /\s/.test(text[i + 1] || ''))) { s = i + 1; break; }
    s = i;
  }
  let e = end;
  const hi = Math.min(text.length, end + 300);
  for (let i = end; i < hi; i++) {
    e = i + 1;
    const c = text[i];
    if (c === '\n') { e = i; break; }
    if ((c === '.' || c === '!' || c === '?') && /\s/.test(text[i + 1] || ' ')) break;
  }
  while (s < e && /\s/.test(text[s])) s++;
  if (e - s > cap) e = s + cap;
  return [s, e];
}

/** @returns {{category:string, severity:string, start:number, end:number, quote:string, rule:string}[]} */
export function runRules(text) {
  const hits = [];
  for (const rule of RULES) {
    const seen = [];
    for (const re of rule.patterns) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(text))) {
        if (m[0].length === 0) { g.lastIndex++; continue; }
        const [s, e] = expandToSentence(text, m.index, m.index + m[0].length);
        if (seen.some(([a, b]) => s < b && e > a)) continue; // aynı kategoride çakışan cümle -> tek hit
        seen.push([s, e]);
        hits.push({ category: rule.category, severity: rule.severity, start: s, end: e, quote: text.slice(s, e), rule: re.source.slice(0, 60) });
      }
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}
