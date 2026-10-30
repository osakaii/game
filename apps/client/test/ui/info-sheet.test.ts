// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { HowToPlay, InfoSheet } from '../../src/ui/info-sheet';

const el = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function markup() {
  document.body.innerHTML = `
    <button id="menu-help"></button>
    <div id="howto" hidden><section><button data-close></button></section></div>`;
}

describe('InfoSheet', () => {
  beforeEach(markup);

  it('closes with its button and with a tap outside the card, not inside', () => {
    const sheet = new InfoSheet('#howto');
    sheet.open();
    el('section').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(sheet.isOpen).toBe(true);
    el('#howto').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(sheet.isOpen).toBe(false);
    sheet.open();
    el('[data-close]').click();
    expect(sheet.isOpen).toBe(false);
  });
});

describe('HowToPlay', () => {
  beforeEach(() => {
    markup();
    localStorage.clear();
  });

  it('the «?» glows for a newcomer until the help is opened once', () => {
    new HowToPlay(el('#menu-help'));
    expect(el('#menu-help').classList.contains('unseen')).toBe(true);
    el('#menu-help').click();
    expect(el('#howto').hidden).toBe(false);
    expect(el('#menu-help').classList.contains('unseen')).toBe(false);
    // Следующий запуск: уже видел — кнопка спокойная.
    markup();
    new HowToPlay(el('#menu-help'));
    expect(el('#menu-help').classList.contains('unseen')).toBe(false);
  });
});
