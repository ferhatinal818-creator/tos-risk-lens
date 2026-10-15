// Gerçek Chromium (Playwright) ile uçtan uca doğrulama: önce harness (demo arayüzü), sonra DERLENMİŞ UZANTI.
// Çalıştırma: npm run build && node scripts/browser-check.mjs [--shots]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv.includes('--shots');
const shotDir = path.join(root, 'demo', 'shots');
if (SHOTS) mkdirSync(shotDir, { recursive: true });

const server = await startServer(0);
const origin = `http://127.0.0.1:${server.address().port}`;
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failed++; };
const T = (page, id) => page.locator(`[data-testid="${id}"]`);

async function runAnalysis(page, { agent = false } = {}) {
  if (!agent) { const cb = T(page, 'agent-toggle'); if (await cb.count()) await cb.uncheck(); }
  await T(page, 'analyze-btn').click();
  await Promise.race([T(page, 'score').waitFor({ timeout: 60000 }), T(page, 'error').waitFor({ timeout: 60000 })]);
  if (await T(page, 'error').count()) throw new Error('analiz hatası: ' + (await T(page, 'error').innerText()));
}

// ───────── 1) HARNESS ─────────
console.log('\n[1] Harness (demo arayüzü)');
const browser = await chromium.launch();
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log(' Mutlu yol: tos-clean');
  await page.goto(`${origin}/fixtures/tos-clean.html?harness=1`);
  ok(await T(page, 'disclaimer').isVisible(), 'hukuki tavsiye uyarısı görünür (idle)');
  await runAnalysis(page);
  ok(/hukuki tavsiye vermez/.test(await T(page, 'disclaimer').innerText()), 'uyarı rapor ekranında da görünür');
  ok(parseInt(await T(page, 'score').innerText(), 10) >= 75, `skor yüksek: ${await T(page, 'score').innerText()}`);
  ok((await T(page, 'finding').count()) === 12, `12 bulgu (${await T(page, 'finding').count()})`);
  ok((await T(page, 'quote').count()) === 12, 'her bulgunun alıntısı var');
  await T(page, 'show-in-page').first().click();
  const hl = await page.evaluate(() => CSS.highlights?.size ?? 0);
  ok(hl >= 1, 'alıntı sayfada vurgulandı (CSS Highlight)');
  if (SHOTS) await page.screenshot({ path: path.join(shotDir, '1-mutlu-yol.png') });

  console.log(' Belirsizlik: tos-belirsiz');
  await page.goto(`${origin}/fixtures/tos-belirsiz.html?harness=1`);
  await runAnalysis(page);
  ok((await T(page, 'uncertainty-item').count()) >= 4, `belirsizlik maddeleri görünür (${await T(page, 'uncertainty-item').count()})`);
  ok((await T(page, 'low-confidence').count()) >= 1, 'düşük güven etiketi var');
  await T(page, 'rejected').locator('summary').click();
  const rq = await T(page, 'rejected-quote').innerText();
  ok(/zorunlu tahkim/.test(rq), 'uydurma tahkim iddiası "reddedilen" listesinde');
  ok(!(await T(page, 'finding').allInnerTexts()).some((t) => /tahkim/i.test(t)), 'uydurma iddia bulgular arasında YOK');
  if (SHOTS) await page.screenshot({ path: path.join(shotDir, '2-belirsizlik.png') });

  console.log(' Enjeksiyon: tos-injected');
  await page.goto(`${origin}/fixtures/tos-injected.html?harness=1`);
  await runAnalysis(page);
  ok(await T(page, 'integrity-banner').isVisible(), 'enjeksiyon uyarısı görünür');
  ok(parseInt(await T(page, 'score').innerText(), 10) >= 75, 'skor enjeksiyondan etkilenmedi');
  ok((await T(page, 'finding').count()) === 12, 'bulgular eksilmedi (12)');
  if (SHOTS) await page.screenshot({ path: path.join(shotDir, '3-enjeksiyon.png') });

  console.log(' page-agent: tos-accordion (ele geçirilmiş model bait düğmesine tıklamaya çalışır)');
  await page.goto(`${origin}/fixtures/tos-accordion.html?harness=1`);
  await runAnalysis(page, { agent: true });
  ok((await page.evaluate(() => document.body.dataset.baited)) === undefined, 'bait düğmesine TIKLANMADI (guard engelledi)');
  ok((await T(page, 'agent-blocked').count()) >= 1, 'engellenen tıklama raporda listelendi');
  ok((await T(page, 'finding').filter({ hasText: /tahkim|arbitration/i }).count()) >= 1, 'katlanmış bölümdeki tahkim maddesi bulundu (page-agent açtı)');
  ok(await page.evaluate(() => document.getElementById('acc').getAttribute('aria-expanded')) === 'true', 'bölüm page-agent ile gerçekten açıldı');
  if (SHOTS) await page.screenshot({ path: path.join(shotDir, '4-page-agent.png') });

  ok(errors.length === 0, `sayfa hatası yok ${errors.length ? JSON.stringify(errors.slice(0, 2)) : ''}`);
  await page.close();
}
await browser.close();

// ───────── 2) GERÇEK UZANTI ─────────
console.log('\n[2] Derlenmiş uzantı (MV3, content script + service worker)');
{
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${path.join(root, 'dist/extension')}`, `--load-extension=${path.join(root, 'dist/extension')}`],
    viewport: { width: 1280, height: 900 },
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  ok(!!sw, 'service worker ayağa kalktı');
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });

  await page.goto(`${origin}/fixtures/tos-clean.html`);
  await page.waitForTimeout(800);
  const toggle = () => sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); await chrome.tabs.sendMessage(t.id, { type: 'toggle' }); });

  // LLM ayarı yok -> açıkça söylemeli
  await toggle();
  await T(page, 'overlay').waitFor({ timeout: 10000 });
  ok(await T(page, 'not-configured').isVisible(), 'LLM ayarı yokken "ayar gerekli" uyarısı');
  ok(/hukuki tavsiye vermez/.test(await T(page, 'disclaimer').innerText()), 'uyarı uzantıda görünür');
  await T(page, 'agent-toggle').uncheck();
  await T(page, 'analyze-btn').click();
  await T(page, 'error').waitFor({ timeout: 10000 });
  ok(/Ayarlar/.test(await T(page, 'error').innerText()), 'ayarsız analiz anlaşılır hata veriyor');

  // BYO-key: ayarı service worker'a kaydet (gerçek akışta options sayfası yapar)
  await sw.evaluate(async (base) => { await chrome.storage.local.set({ llm: { baseURL: base, model: 'mock-model', apiKey: 'sk-test-SECRET-123' } }); }, `${origin}/v1`);
  await toggle(); await toggle(); // kapat/aç
  await T(page, 'model-label').waitFor();
  ok(/mock-model/.test(await T(page, 'model-label').innerText()), 'model etiketi görünür');
  await runAnalysis(page);
  ok(parseInt(await T(page, 'score').innerText(), 10) >= 75, `uzantıda skor: ${await T(page, 'score').innerText()}`);
  ok((await T(page, 'finding').count()) === 12, 'uzantıda 12 doğrulanmış bulgu');
  const leaked = await page.evaluate(() => document.documentElement.outerHTML.includes('SECRET') || JSON.stringify(Object.keys(window)).includes('SECRET'));
  ok(!leaked, 'API anahtarı sayfa DOM/JS bağlamında yok');
  const storedKey = await sw.evaluate(async () => (await chrome.storage.local.get('llm')).llm.apiKey);
  ok(storedKey === 'sk-test-SECRET-123', 'anahtar yalnızca extension storage’da');
  if (SHOTS) await page.screenshot({ path: path.join(shotDir, '5-uzanti.png') });

  // Uzantıda enjeksiyon sayfası
  await page.goto(`${origin}/fixtures/tos-injected.html`);
  await page.waitForTimeout(600);
  await toggle();
  await runAnalysis(page);
  ok(await T(page, 'integrity-banner').isVisible() && (await T(page, 'finding').count()) === 12, 'uzantıda enjeksiyon sayfası: uyarı + 12 bulgu');

  // Uzantıda page-agent (service worker üzerinden LLM proxy)
  await page.goto(`${origin}/fixtures/tos-accordion.html`);
  await page.waitForTimeout(600);
  await toggle();
  await runAnalysis(page, { agent: true });
  ok((await page.evaluate(() => document.body.dataset.baited)) === undefined, 'uzantıda bait düğmesine TIKLANMADI');
  ok((await T(page, 'agent-blocked').count()) >= 1, 'uzantıda engelleme raporlandı');
  ok((await T(page, 'finding').filter({ hasText: /tahkim|arbitration/i }).count()) >= 1, 'uzantıda page-agent katlanmış bölümü açtı');
  if (SHOTS) await page.screenshot({ path: path.join(shotDir, '6-uzanti-agent.png') });

  ok(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).length === 0, `konsol/sayfa hatası yok ${JSON.stringify(logs.slice(0, 3))}`);
  await ctx.close();
}
server.close();
console.log(failed ? `\n${failed} KONTROL BAŞARISIZ` : '\nTÜM KONTROLLER GEÇTİ');
process.exit(failed ? 1 : 0);
