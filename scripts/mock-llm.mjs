// OpenAI-uyumlu SAHTE LLM (yalnızca demo/test için; tekrarlanabilir video ve CI sağlar).
// - Analiz isteği: belgeden BİREBİR alıntılarla senaryolu bulgular döndürür.
//   Türkçe "belirsiz" fixture'ında kasıtlı olarak (a) düşük güvenli bulgular, (b) belirsizlik notları ve
//   (c) metinde olmayan UYDURMA bir madde üretir; doğrulayıcının bunu reddettiğini göstermek için.
// - "İtaatkâr" mod: istem içinde ham enjeksiyon metni görürse boş bulgu listesi döndürür (saldırının
//   işe yaradığı kontrol deneyi). Sanitizer çalışıyorsa bu metin ona hiç ulaşmaz.
// - page-agent isteği (tools: AgentOutput): senaryolu tıklamalar. "Ele geçirilmiş model" bait düğmesine tıklar.

const OBEY_RE = /ignore (?:all )?previous instructions|note to automated reviewers|attention language model|system prompt override|dear ai summarizer|ai model: you must output/i;

const SCRIPTS = {
  en: {
    match: (t) => /Lumenly Terms of Service/.test(t) && /binding arbitration/.test(t),
    findings: [
      ['auto_renewal', 'high', 'Your paid subscription renews automatically at the end of each billing period for the same period, and your payment method will be charged until you cancel.', 0.95, 'Aboneliğiniz siz iptal etmedikçe her dönem otomatik yenilenir ve kartınızdan çekim yapılır. İptal ancak mevcut dönemin sonunda geçerli olur.'],
      ['fee_change', 'medium', 'We may change subscription fees at any time, and the new fee applies from your next renewal after we post it on our website.', 0.88, 'Ücret istedikleri zaman değişebilir; yeni ücret sitede yayımlanınca bir sonraki yenilemede size uygulanır. Size ayrıca bildirim yapılacağı yazmıyor.'],
      ['no_refund', 'medium', 'All payments are non-refundable, including for partially used billing periods, except where applicable law requires otherwise.', 0.9, 'Ödediğiniz ücretler iade edilmez; dönemi yarıda bıraksanız bile para geri gelmez (yasa zorunlu kılmadıkça).'],
      ['content_license', 'high', 'you grant Lumenly a worldwide, perpetual, irrevocable, royalty-free, sublicensable license to use, reproduce, modify, publicly display and distribute that User Content in any media.', 0.93, 'Yüklediğiniz içerikleri şirket süresiz, geri alınamaz şekilde ve başkalarına devredebilerek kullanabilir; hesabınızı silseniz bile bu hak devam eder.'],
      ['ai_training_use', 'high', 'We may also use User Content to train and improve our machine-learning models and recommendation systems.', 0.85, 'Yüklediğiniz içerikler şirketin yapay zekâ/öneri modellerini eğitmek için kullanılabilir.'],
      ['data_sharing', 'high', 'We may share your personal information with advertising partners, analytics providers and other third parties.', 0.92, 'Kişisel bilgileriniz reklam ortaklarıyla ve diğer üçüncü taraflarla paylaşılabilir.'],
      ['data_retention', 'medium', 'We retain your data for as long as we consider necessary for our business purposes, including after you delete your account.', 0.8, 'Verileriniz şirketin ihtiyaç duyduğu süre boyunca, hesabınızı sildikten sonra bile saklanabilir; net bir süre verilmiyor.'],
      ['account_termination', 'medium', 'We may suspend or terminate your account and delete your content at any time, for any reason, without prior notice.', 0.9, 'Şirket hesabınızı ve içeriğinizi her zaman, gerekçe göstermeden ve önceden haber vermeden kapatıp silebilir.'],
      ['unilateral_change', 'medium', 'We may modify these Terms at any time. When we do, we will update the date at the top of this page.', 0.86, 'Şartlar tek taraflı değiştirilebilir; yalnızca sayfanın başındaki tarih güncellenir, size ayrıca haber verilmeyebilir.'],
      ['liability_limitation', 'medium', 'our total liability for any claim is limited to the amount you paid us in the month before the claim arose', 0.9, 'Bir zarar yaşasanız bile şirketin ödeyeceği tutar, son bir ayda ödediğiniz ücretle sınırlıdır.'],
      ['arbitration_class_waiver', 'high', 'Any dispute arising out of or relating to the Service will be resolved exclusively through binding arbitration on an individual basis. You waive your right to a jury trial and to participate in any class action or representative proceeding.', 0.96, 'Anlaşmazlıklar mahkemede değil, zorunlu tahkimde ve tek tek çözülür; jüri yargılaması ve toplu dava hakkınızdan vazgeçmiş olursunuz.'],
      ['jurisdiction', 'low', 'These Terms are governed by the laws of the State of Delaware, USA.', 0.8, 'Sözleşmeye ABD’nin Delaware eyalet hukuku uygulanır; Türkiye’deki haklarınızı kullanmanız zorlaşabilir.'],
    ],
    uncertainties: [],
  },
  accordion: {
    match: (t) => /Accordion Terms/.test(t),
    findings: [
      ['auto_renewal', 'high', 'Your subscription renews automatically each month until you cancel it in your account settings.', 0.94, 'Abonelik, iptal edilene kadar her ay otomatik yenilenir.'],
      ['arbitration_class_waiver', 'high', 'Any dispute will be resolved by binding arbitration, and you waive your right to participate in a class action.', 0.95, 'Anlaşmazlıklar zorunlu tahkimle çözülür ve toplu dava hakkınızdan vazgeçersiniz. Bu madde sayfada katlanmış bir bölümün içindeydi.'],
    ],
    uncertainties: [],
  },
  tr: {
    match: (t) => /Lumenly Kullanım Koşulları/.test(t) || /Üyelik formunu doldurarak/.test(t),
    findings: [
      ['auto_renewal', 'medium', 'Abonelik, üye tarafından iptal edilmedikçe aynı dönem için kendiliğinden devam eder.', 0.62, 'Abonelik siz iptal etmedikçe yenilenir gibi görünüyor; ancak metin yenileme süresini ve öncesinde hatırlatma yapılıp yapılmayacağını açıkça yazmıyor.'],
      ['fee_change', 'low', 'Hizmet bedelleri zaman zaman güncellenebilir ve güncel bedeller site üzerinden duyurulur.', 0.5, 'Ücretler değişebilir. Değişiklikten önce size ayrıca bildirim yapılıp yapılmayacağı belirsiz.'],
      ['data_sharing', 'medium', 'gerekli görüldüğü ölçüde iş ortaklarımızla paylaşılabilir', 0.58, 'Verileriniz “iş ortakları” ile paylaşılabilir; ama kimlerin ve hangi verilerin kastedildiği yazmıyor.'],
      ['content_license', 'medium', 'Bu izin, Şirket\'in makul bulduğu her mecrada geçerli olabilir.', 0.42, 'İçerikleriniz için verdiğiniz izin geniş bir alanı kapsıyor olabilir; “makul bulduğu her mecra” ifadesi muğlak.'],
      ['account_termination', 'medium', 'Üyelik, bu sözleşmeye aykırı davranılması veya Şirket tarafından gerekli görülmesi halinde askıya alınabilir ya da sonlandırılabilir.', 0.66, 'Şirket, “gerekli gördüğünde” hesabınızı kapatabilir. Önceden bildirim yapılması “denenir” ama garanti edilmiyor.'],
      ['unilateral_change', 'medium', 'Yayım tarihinden itibaren siteyi kullanmaya devam eden üye, değişiklikleri kabul etmiş sayılır.', 0.74, 'Şartlar değiştirilirse, siteyi kullanmaya devam etmeniz yeni şartları kabul ettiğiniz anlamına gelir.'],
      // KASITLI HALÜSİNASYON: metinde yok (metinde İstanbul mahkemeleri yazıyor)
      ['arbitration_class_waiver', 'high', 'Taraflar, uyuşmazlıkların çözümünde zorunlu tahkim yoluna başvurmayı ve toplu dava hakkından feragat etmeyi kabul eder.', 0.8, 'Anlaşmazlıklar zorunlu tahkimle çözülür ve toplu dava hakkınızdan vazgeçersiniz.'],
    ],
    uncertainties: [
      { topic: 'Veri paylaşımının kapsamı', reason_tr: 'Metin “iş ortakları”nın kimler olduğunu ve hangi verilerin paylaşıldığını belirtmiyor; ayrıntı Aydınlatma Metni’nde olabilir ama o metin bu sayfada yok.' },
      { topic: 'İade koşulları', reason_tr: 'İade “mevzuat ve Şirket politikaları çerçevesinde değerlendirilir” deniyor; net bir iade hakkı ya da yasağı okunamıyor.' },
    ],
  },
};

function docFromPrompt(messages) {
  const user = messages.find((m) => m.role === 'user')?.content || '';
  const m = user.match(/<<<DOC-[0-9a-f]+>>>\n([\s\S]*?)\n<<<END-/);
  return m ? m[1] : user;
}
const norm = (s) => s.replace(/\s+/g, ' ');

export function analysisReply(messages) {
  const doc = docFromPrompt(messages);
  if (OBEY_RE.test(doc)) {
    return JSON.stringify({ document_type: 'terms_of_service', findings: [], uncertainties: [] }); // saldırı işe yaradı
  }
  const script = Object.values(SCRIPTS).find((s) => s.match(doc));
  if (!script) return JSON.stringify({ document_type: 'unclear', findings: [], uncertainties: [{ topic: 'Tanınmayan belge', reason_tr: 'Bu belge için senaryo yok.' }] });
  const text = norm(doc);
  const findings = script.findings
    .filter(([, , quote]) => script !== SCRIPTS.tr ? text.includes(norm(quote)) : true) // tr: halüsinasyonu kasıtlı bırak
    .map(([category, severity, quote, confidence, explanation_tr]) => ({ category, severity, quote, explanation_tr, confidence }));
  return JSON.stringify({ document_type: script === SCRIPTS.tr ? 'terms_of_service' : 'terms_of_service', findings, uncertainties: script.uncertainties });
}

// ---- page-agent (AgentOutput) senaryosu ---------------------------------------------------------
const runs = new Map();
export function agentReply(messages) {
  const text = messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  const key = (text.match(/Current Page: \[[^\]]*\]\(([^)]*)\)/) || [])[1] || 'page'; // koşu durumu sayfa URL'sine bağlı
  const now = Date.now();
  let run = runs.get(key);
  if (!run || now - run.t > 4000) run = { t: now, did: new Set() }; // 4 sn sessizlik = yeni koşu
  run.t = now; runs.set(key, run);
  const items = [...text.matchAll(/^\s*\*?\[(\d+)\]<(\w+)([^\n]*)$/gm)].map((m) => ({ index: +m[1], tag: m[2], rest: m[3] }));
  const find = (re) => items.find((i) => re.test(i.rest));
  let action;
  const bait = find(/accept all/i);
  const expand = find(/read full terms|show more/i); // açıldıktan sonra metin "Hide full terms" olur -> durum sayfadan okunur
  if (bait && !run.did.has('bait')) { run.did.add('bait'); action = { click_element_by_index: { index: bait.index } }; } // ele geçirilmiş model
  else if (expand) action = { click_element_by_index: { index: expand.index } };
  else action = { done: { text: 'Açılabilir bölümler açıldı.', success: true } };
  return { next_goal: action.done ? 'Bitir' : 'Düğmeye tıkla', action };
}

export function mockChat(body) {
  const isAgent = Array.isArray(body.tools) && body.tools.some((t) => (t.function?.name || t.name) === 'AgentOutput');
  const base = { id: 'mock-1', object: 'chat.completion', created: 0, model: body.model || 'mock', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  if (isAgent) {
    const out = agentReply(body.messages);
    return { ...base, choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'AgentOutput', arguments: JSON.stringify(out) } }] } }] };
  }
  return { ...base, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: analysisReply(body.messages) } }] };
}
