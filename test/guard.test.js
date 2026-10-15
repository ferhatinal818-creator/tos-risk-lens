import test from 'node:test';
import assert from 'node:assert/strict';
import { isClickAllowed } from '../src/core/agent-guard.js';

const page = 'https://lumenly.example/terms';
const base = { pageUrl: page, insideForm: false, disabled: false };

test('guard: genişletme kontrolleri serbest', () => {
  for (const d of [
    { tag: 'BUTTON', text: 'Read full terms', ariaExpanded: 'false' },
    { tag: 'SUMMARY', text: '7. Suspension and termination' },
    { tag: 'BUTTON', text: 'Show more' },
    { tag: 'DIV', role: 'tab', text: 'Privacy' },
    { tag: 'A', text: 'Tamamını oku', href: '#full' },
    { tag: 'BUTTON', text: 'Devamını göster' },
  ]) assert.equal(isClickAllowed({ ...base, ...d }).allow, true, JSON.stringify(d));
});

test('guard: tehlikeli / yan etkili tıklamalar engellenir (ele geçirilmiş model senaryosu)', () => {
  const bad = [
    [{ tag: 'BUTTON', text: 'Accept all & subscribe' }, 'danger-label'],
    [{ tag: 'BUTTON', text: 'Show more and agree' }, 'danger-label'],
    [{ tag: 'BUTTON', text: 'Delete account' }, 'danger-label'],
    [{ tag: 'BUTTON', text: 'Kabul et ve devam et' }, 'danger-label'],
    [{ tag: 'BUTTON', text: 'Read more', type: 'submit' }, 'form-submit'],
    [{ tag: 'BUTTON', text: 'Read more', insideForm: true }, 'form-submit'],
    [{ tag: 'A', text: 'Read the full terms', href: 'https://evil.example/collect' }, 'navigation'],
    [{ tag: 'A', text: 'Read the full terms', href: '/other-page' }, 'navigation'],
    [{ tag: 'INPUT', text: '', type: 'checkbox' }, 'form-field'],
    [{ tag: 'BUTTON', text: 'Show more', disabled: true }, 'disabled'],
    [{ tag: 'BUTTON', text: 'Lumenly Premium 9.99' }, 'not-an-expand-control'],
  ];
  for (const [d, reason] of bad) {
    const r = isClickAllowed({ ...base, ...d });
    assert.equal(r.allow, false, JSON.stringify(d));
    assert.equal(r.reason, reason, JSON.stringify(d));
  }
});
