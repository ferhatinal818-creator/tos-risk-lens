// Sayfanın bir koşul/politika/abonelik metni olup olmadığını SAYFA DIŞINA METİN GÖNDERMEDEN sezer.
const URL_RE = /(terms|tos\b|legal|privacy|policy|policies|eula|conditions|agreement|subscription|billing|membership|gizlilik|kullanim|kullanım|kosul|koşul|sozlesme|sözleşme|sartlar|şartlar|abonelik|uyelik|üyelik|kvkk|aydinlatma|aydınlatma)/i;
const TITLE_RE = /(terms|conditions|privacy|policy|agreement|subscription|eula|gizlilik|kullanım|koşul|sözleşme|şartlar|abonelik|üyelik|kvkk|aydınlatma)/i;
const LEGAL_WORDS = /\b(?:agree|liability|governing law|arbitration|personal (?:data|information)|cookies|warrant(?:y|ies)|indemnif\w+|terminate|license|subscription|renew\w*|sözleşme|kişisel veri|sorumluluk|taraflar|abonelik|yenilen\w+|kvkk|iptal|fesih|lisans)\b/gi;
const PRIVACY_WORDS = /\b(?:privacy|personal (?:data|information)|cookies|data controller|processing|gizlilik|kişisel veri|aydınlatma|kvkk|çerez)\b/gi;
const SUBS_WORDS = /\b(?:subscription|billing|renew\w*|free trial|cancel\w*|refund|abonelik|yenilen\w+|deneme|iptal|iade)\b/gi;

export function detectLegalPage({ url = '', title = '', headings = '', text = '' }) {
  const signals = [];
  let score = 0;
  let path = '';
  try { const u = new URL(url); path = u.pathname + u.hostname; } catch { path = url; }
  if (URL_RE.test(path)) { score += 2; signals.push('url'); }
  if (TITLE_RE.test(title)) { score += 2; signals.push('title'); }
  if (TITLE_RE.test(headings)) { score += 2; signals.push('heading'); }
  const words = (text.match(/\S+/g) || []).length;
  const legal = (text.match(LEGAL_WORDS) || []).length;
  const density = words ? legal / (words / 1000) : 0;
  if (words > 800 && density >= 6) { score += 3; signals.push('legal-density'); }
  else if (words > 800 && density >= 3) { score += 1; signals.push('legal-density-low'); }
  if (words < 600) score -= 3;
  const priv = (text.match(PRIVACY_WORDS) || []).length;
  const subs = (text.match(SUBS_WORDS) || []).length;
  let kind = 'terms';
  if (priv > legal * 0.6 && priv >= subs) kind = 'privacy';
  else if (subs > legal * 0.5 && /abonelik|subscription|billing|membership/i.test(title + url)) kind = 'subscription';
  return { detected: score >= 4, score, kind, signals, words };
}
