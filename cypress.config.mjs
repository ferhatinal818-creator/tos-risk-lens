import { defineConfig } from 'cypress';
import { startServer } from './scripts/serve.mjs';

// Önce `npm run build` (dist/demo/harness.js gerekli). Sunucu (statik + sahte LLM) testle birlikte açılıp kapanır.
export default defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:8787',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1280,
    viewportHeight: 800,
    video: true,
    videoCompression: 24,
    screenshotOnRunFailure: true,
    includeShadowDom: true, // arayüz Shadow DOM içinde
    defaultCommandTimeout: 10000,
    retries: 0,
    async setupNodeEvents(on, config) {
      const server = await startServer(8787);
      on('after:run', () => new Promise((r) => server.close(r)));
      return config;
    },
  },
});
