// page-agent güvenlik testi (videoya dahil değil): ele geçirilmiş (sahte) model tuzak düğmeye tıklamaya çalışır.
describe('page-agent tıklama koruması', () => {
  it('bait düğmesi engellenir, katlanmış bölüm açılır ve analiz edilir', () => {
    cy.visit('/fixtures/tos-accordion.html?harness=1');
    cy.analyze({ agent: true });
    cy.document().its('body').should(($b) => expect($b[0].dataset.baited).to.equal(undefined)); // tıklanmadı
    cy.tid('agent-blocked').should('have.length.gte', 1).and('contain.text', 'Accept all');
    cy.get('#acc').should('have.attr', 'aria-expanded', 'true');
    cy.tid('finding').should(($f) => expect($f.text()).to.match(/tahkim/i));
  });
});
