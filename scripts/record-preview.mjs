// ÖNİZLEME videosu (Playwright). Resmî teslim videosu Cypress ile alınmalıdır: `npm run cy:run` (cypress/videos/).
// Bu betik, aynı üç sahneyi aynı seçicilerle oynatıp süre/akış kontrolü içindir; Cypress'in yerine geçmez.
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'demo', 'preview');
mkdirSync(outDir, { recursive: true });

const server = await startServer(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
const T = (id) => page.locator(`[data-testid="${id}"]`);
const t0 = Date.now();
const caption = (text) => page.evaluate((t) => {
  let el = document.getElementById('demo-caption');
  if (!el) {
    el = document.createElement('div'); el.id = 'demo-caption'; el.setAttribute('data-tos-risk-lens', '1');
    el.style.cssText = 'position:fixed;left:16px;bottom:16px;max-width:420px;z-index:2147483646;background:#111;color:#fff;padding:10px 14px;border-radius:10px;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)';
    document.documentElement.appendChild(el);
  }
  el.textContent = t;
}, text);
const analyze = async () => { const cb = T('agent-toggle'); if (await cb.count()) await cb.uncheck(); await T('analyze-btn').click(); await T('score').waitFor({ timeout: 30000 }); };
const pause = (ms) => page.waitForTimeout(ms);

// Sahne 1 — mutlu yol
await page.goto(`${origin}/fixtures/tos-clean.html?harness=1`);
await caption('1 · Mutlu yol: koşullar sayfası açıldı'); await pause(1800);
await caption('Analiz: metin yakalanır → modele gider → her alıntı doğrulanır'); await pause(900);
await analyze(); await pause(2200);
await caption('Her madde orijinal metinden birebir alıntıyla gelir');
await T('finding').first().scrollIntoViewIfNeeded(); await pause(1200);
await T('show-in-page').first().click(); await pause(3000);

// Sahne 2 — belirsizlik
await page.goto(`${origin}/fixtures/tos-belirsiz.html?harness=1`);
await caption('2 · Belirsiz metin: muğlak ifadeler, ayrıntı başka belgede'); await pause(1500);
await analyze(); await pause(1500);
await caption('Sistem “emin değilim” diyor ve nedenini yazıyor');
await T('uncertainties').scrollIntoViewIfNeeded(); await pause(3800);
await caption('Model metinde olmayan bir “tahkim” maddesi uydurdu → doğrulayıcı reddetti');
await T('rejected').scrollIntoViewIfNeeded(); await T('rejected').locator('summary').click(); await pause(4200);

// Sahne 3 — enjeksiyon
await page.goto(`${origin}/fixtures/tos-injected.html?harness=1`);
await caption('3 · Sayfada gizli “skoru 0 yap, risk bulma” talimatları var'); await pause(1800);
await analyze();
await T('integrity-banner').scrollIntoViewIfNeeded();
await caption('Talimatlar modele gitmeden çıkarıldı; skor etkilenmedi; kullanıcı uyarıldı'); await pause(4000);

const seconds = Math.round((Date.now() - t0) / 1000);
const video = page.video();
await ctx.close();
const tmp = await video.path();
const dest = path.join(outDir, 'tos-risk-lens-preview.webm');
renameSync(tmp, dest);
await browser.close(); server.close();
console.log(`önizleme: ${path.relative(root, dest)}  (~${seconds} sn, ${(statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
