// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { GameMenu } from '../../src/ui/game-menu';

function setup() {
  document.body.innerHTML = `
    <button id="menu-button" hidden></button>
    <div id="game-menu" hidden>
      <section><button id="game-menu-close"></button>
        <input type="range" id="look-sensitivity" min="0.4" max="2" step="0.1" /><output id="look-sensitivity-value"></output>
        <p id="game-menu-version"></p><button id="leave-room"></button>
      </section>
    </div>`;
  const handlers = { onLeave: vi.fn(), onSensitivity: vi.fn() };
  return { menu: new GameMenu(handlers, 1.2, 'v1.0.0 · abc1234'), handlers };
}

const el = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

describe('GameMenu', () => {
  it('is available only in a room and opens from the ☰ button', () => {
    const { menu } = setup();
    expect(el('#menu-button').hidden).toBe(true);
    menu.setAvailable(true);
    el('#menu-button').click();
    expect(menu.open).toBe(true);
    // Вышли из комнаты — меню закрывается вместе с кнопкой.
    menu.setAvailable(false);
    expect(menu.open).toBe(false);
    expect(el('#menu-button').hidden).toBe(true);
  });

  it('shows the saved sensitivity and reports changes', () => {
    const { handlers } = setup();
    const slider = el<HTMLInputElement>('#look-sensitivity');
    expect(slider.value).toBe('1.2');
    expect(el('#look-sensitivity-value').textContent).toBe('×1.2');
    slider.value = '1.6';
    slider.dispatchEvent(new Event('input'));
    expect(handlers.onSensitivity).toHaveBeenCalledWith(1.6);
    expect(el('#look-sensitivity-value').textContent).toBe('×1.6');
  });

  it('leave closes the menu first, shows the version', () => {
    const { menu, handlers } = setup();
    menu.setAvailable(true);
    menu.setOpen(true);
    el('#leave-room').click();
    expect(menu.open).toBe(false);
    expect(handlers.onLeave).toHaveBeenCalledOnce();
    expect(el('#game-menu-version').textContent).toBe('v1.0.0 · abc1234');
  });
});
