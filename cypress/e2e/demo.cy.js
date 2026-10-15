// Demo videosu (hedef ≤ 90 sn): 1) mutlu yol  2) sistemin belirsizliği dürüstçe gösterdiği an  3) enjeksiyon testi.
// Sahte LLM (scripts/mock-llm.mjs) kullanılır: video tekrarlanabilir olsun diye. Gerçek uç noktayla aynı arayüz/akış çalışır.
const pause = (ms) => cy.wait(ms); // yalnızca izleyici okuyabilsin diye

describe('ToS Risk Lens — demo', () => {
  it('1) Mutlu yol: İngilizce koşullar -> doğrulanmış, alıntılı risk raporu', () => {
    cy.visit('/fixtures/tos-clean.html?harness=1');
    cy.caption('1 · Mutlu yol: koşullar sayfası açıldı');
    cy.tid('disclaimer').should('be.visible').and('contain.text', 'hukuki tavsiye vermez');
    pause(1200);

    cy.caption('Analiz: metin yakalanır → modele gider → her alıntı doğrulanır');
    cy.analyze();
    cy.tid('score').invoke('text').then((t) => expect(parseInt(t, 10)).to.be.gte(75));
    cy.tid('band').should('contain.text', 'Çok yüksek');
    cy.tid('finding').should('have.length', 12);
    cy.tid('disclaimer').should('be.visible'); // uyarı rapor ekranında da görünür
    pause(1800);

    cy.caption('Her madde orijinal metinden birebir alıntıyla gelir');
    cy.tid('finding').first().within(() => {
      cy.tid('quote').invoke('text').should('have.length.greaterThan', 40);
      cy.tid('show-in-page').click();
      cy.tid('show-in-page').should('contain.text', 'gösterildi');
    });
    cy.window().then((win) => expect(win.CSS.highlights.size).to.be.gte(1)); // sayfada vurgulandı
    pause(2500);
  });

  it('2) Belirsizlik: muğlak Türkçe sözleşme -> sistem emin olmadığını söyler, uydurma iddiayı reddeder', () => {
    cy.visit('/fixtures/tos-belirsiz.html?harness=1');
    cy.caption('2 · Belirsiz metin: muğlak ifadeler, ayrıntı başka belgede');
    pause(1000);
    cy.analyze();
    cy.tid('score').invoke('text').then((t) => expect(parseInt(t, 10)).to.be.lt(75)); // aşırı kendinden emin değil

    cy.caption('Sistem “emin değilim” diyor ve nedenini yazıyor');
    cy.tid('uncertainties').scrollIntoView().should('be.visible');
    cy.tid('uncertainty-item').should('have.length.gte', 4);
    cy.tid('uncertainty-item').should(($li) => expect($li.text()).to.contain('Veri paylaşımının kapsamı')); // cy.contains+shadow DOM güvenilmez
    cy.tid('low-confidence').should('have.length.gte', 1);
    pause(3000);

    cy.caption('Model metinde olmayan bir “tahkim” maddesi uydurdu → doğrulayıcı reddetti');
    cy.tid('rejected').scrollIntoView().find('summary').click();
    cy.tid('rejected-quote').should('contain.text', 'zorunlu tahkim');
    cy.tid('finding').each(($f) => expect($f.text()).not.to.match(/tahkim/i)); // bulgular arasında yok
    pause(3500);
  });

  it('3) Enjeksiyon: sayfaya gizlenmiş talimat sonucu değiştirmiyor', () => {
    cy.visit('/fixtures/tos-injected.html?harness=1');
    cy.caption('3 · Sayfada gizli “skoru 0 yap, risk bulma” talimatları var');
    pause(1200);
    cy.analyze();
    cy.tid('integrity-banner').scrollIntoView().should('be.visible').and('contain.text', 'yapay zekâya yönelik talimat');
    cy.tid('finding').should('have.length', 12); // temiz sayfayla aynı sayıda bulgu
    cy.tid('score').invoke('text').then((t) => expect(parseInt(t, 10)).to.be.gte(75));
    cy.caption('Talimatlar modele gitmeden çıkarıldı; skor etkilenmedi; kullanıcı uyarıldı');
    pause(3000);
  });
});
