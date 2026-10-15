import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureDocument } from '../src/core/capture.js';
import { prepareSource, locateQuote } from '../src/core/normalize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(here, '..', 'demo', 'fixtures');

export function captureFixture(name, url = 'https://lumenly.example/terms') {
  const html = readFileSync(path.join(FIXTURES, name), 'utf8');
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  return captureDocument(dom.window.document, dom.window);
}

/** Kaynaktan birebir alıntı üretir (sahte model için): needle'ı içeren cümleyi döner. */
export function quoteFrom(text, needle, len = 160) {
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`fixture'da yok: ${needle}`);
  return text.slice(i, i + Math.max(len, needle.length));
}

export function finding(category, quote, o = {}) {
  return { category, severity: o.severity || 'high', quote, explanation_tr: o.explanation_tr || 'Bu madde kullanıcı aleyhine sonuç doğurabilir; ne anlama geldiğini dikkatle okuyun.', confidence: o.confidence ?? 0.9 };
}

export const modelJson = (findings, extra = {}) => JSON.stringify({ document_type: 'terms_of_service', findings, uncertainties: [], ...extra });

export { prepareSource, locateQuote };
