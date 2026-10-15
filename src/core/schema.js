// Tek doğruluk kaynağı: kategori tablosu + rapor JSON şeması.
// Şema hem modele (response_format) gönderilir hem de doğrulayıcıda uygulanır.

export const CATEGORIES = {
  auto_renewal:            { label: 'Otomatik yenileme / iptal zorluğu',               weight: 7, def: 'Subscription renews automatically / recurring charges until cancelled, hard-to-cancel flow, trial converts to paid.' },
  fee_change:              { label: 'Fiyat/ücret değişikliği ve gizli ücret',            weight: 6, def: 'Company can change prices/fees, extra or hidden charges, fees applied without clear notice.' },
  no_refund:               { label: 'İade yok / geri ödeme sınırı',                      weight: 5, def: 'Payments are non-refundable or refunds are strongly limited.' },
  unilateral_change:       { label: 'Şartları tek taraflı değiştirme',                   weight: 6, def: 'Company may change terms/policy at any time, possibly without direct notice or consent.' },
  account_termination:     { label: 'Hesabı tek taraflı kapatma / içerik silme',        weight: 5, def: 'Company may suspend/terminate account or delete content at its sole discretion or without notice.' },
  arbitration_class_waiver:{ label: 'Zorunlu tahkim / toplu dava hakkından feragat',     weight: 9, def: 'Binding arbitration, waiver of court / jury trial, class-action waiver.' },
  liability_limitation:    { label: 'Sorumluluk reddi ve sınırlaması',                  weight: 6, def: 'Service "as is", disclaimer of warranties, cap or exclusion of company liability.' },
  indemnification:         { label: 'Kullanıcının tazminat yükümlülüğü',                weight: 5, def: 'User must indemnify / hold harmless the company.' },
  jurisdiction:            { label: 'Yetkili mahkeme / uygulanacak hukuk (yabancı)',    weight: 4, def: 'Disputes governed by foreign law or only in a specific (foreign) court/venue.' },
  data_sharing:            { label: 'Verinin üçüncü taraflarla paylaşımı / satışı',     weight: 9, def: 'Personal data sold or shared with third parties, advertisers, partners, affiliates.' },
  data_collection_tracking:{ label: 'Kapsamlı veri toplama, izleme, profilleme',         weight: 7, def: 'Broad collection of location, contacts, browsing, device, biometric data; cross-site tracking; profiling.' },
  data_retention:          { label: 'Uzun / belirsiz veri saklama',                      weight: 5, def: 'Data kept indefinitely, for unspecified periods, or after account deletion.' },
  content_license:         { label: 'Kullanıcı içeriği üzerinde geniş lisans',          weight: 7, def: 'Broad (worldwide, perpetual, irrevocable, sublicensable) license over user content.' },
  ai_training_use:         { label: 'Verinin/içeriğin yapay zekâ eğitiminde kullanımı', weight: 7, def: 'User content or data may be used to train machine-learning / AI models.' },
  consent_by_use:          { label: 'Kullanarak kabul / örtük rıza',                    weight: 4, def: 'Agreement or consent is assumed merely by using the service.' },
  other_risk:              { label: 'Diğer dikkat gerektiren madde',                    weight: 3, def: 'Another clearly consumer-unfavourable clause that fits none of the above.' },
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);
export const SEVERITIES = ['low', 'medium', 'high'];
export const SEVERITY_LABEL_TR = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
export const DOC_TYPES = ['terms_of_service', 'privacy_policy', 'subscription_terms', 'other', 'unclear'];
export const DOC_TYPE_LABEL_TR = {
  terms_of_service: 'Kullanım koşulları', privacy_policy: 'Gizlilik politikası',
  subscription_terms: 'Abonelik şartları', other: 'Diğer', unclear: 'Belirsiz',
};

export const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'severity', 'quote', 'explanation_tr', 'confidence'],
  properties: {
    category: { type: 'string', enum: CATEGORY_KEYS },
    severity: { type: 'string', enum: SEVERITIES },
    quote: { type: 'string', minLength: 20, maxLength: 600 },
    explanation_tr: { type: 'string', minLength: 10, maxLength: 500 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export const UNCERTAINTY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'reason_tr'],
  properties: {
    topic: { type: 'string', minLength: 3, maxLength: 120 },
    reason_tr: { type: 'string', minLength: 5, maxLength: 400 },
  },
};

export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'findings', 'uncertainties'],
  properties: {
    document_type: { type: 'string', enum: DOC_TYPES },
    findings: { type: 'array', maxItems: 40, items: FINDING_SCHEMA },
    uncertainties: { type: 'array', maxItems: 10, items: UNCERTAINTY_SCHEMA },
  },
};

// OpenAI "strict" yapılandırılmış çıktı bazı kısıt anahtarlarını desteklemez; telde sadeleştirilmiş sürüm,
// doğrulayıcıda tam sürüm kullanılır (kısıtları biz uygularız).
const STRIP = new Set(['minLength', 'maxLength', 'minimum', 'maximum', 'maxItems']);
function toWire(node) {
  if (Array.isArray(node)) return node.map(toWire);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) if (!STRIP.has(k)) out[k] = toWire(v);
    return out;
  }
  return node;
}
export const WIRE_SCHEMA = toWire(REPORT_SCHEMA);
