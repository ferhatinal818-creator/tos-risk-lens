// Videoda izleyiciye ne olduğunu anlatan altyazı. data-tos-risk-lens özniteliği: içerik yakalama bu öğeyi atlar.
Cypress.Commands.add('caption', (text) => {
  cy.document().then((doc) => {
    let el = doc.getElementById('demo-caption');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'demo-caption';
      el.setAttribute('data-tos-risk-lens', '1');
      el.style.cssText = 'position:fixed;left:16px;bottom:16px;max-width:420px;z-index:2147483646;background:#111;color:#fff;padding:10px 14px;border-radius:10px;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)';
      doc.documentElement.appendChild(el);
    }
    el.textContent = text;
  });
});

Cypress.Commands.add('tid', (id) => cy.get(`[data-testid="${id}"]`));

Cypress.Commands.add('analyze', ({ agent = false } = {}) => {
  cy.tid('analyze-btn').should('be.visible');
  if (!agent) cy.tid('agent-toggle').uncheck();
  cy.tid('analyze-btn').click();
  cy.tid('score', { timeout: 30000 }).should('be.visible');
});
