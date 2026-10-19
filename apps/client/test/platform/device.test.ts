// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { preventPageZoom } from '../../src/platform/device';

function setup() {
  // Свой контейнер на каждый тест: обработчики на document копились бы между тестами.
  document.body.innerHTML = '<div id="root"><button id="crouch"></button><input id="nick" /></div>';
  let time = 0;
  preventPageZoom(document.querySelector<HTMLElement>('#root')!, () => time);
  /** touchend в точке (x, y) через dt мс после прошлого; true — жест отменён. */
  const tap = (selector: string, dt: number, x = 100, y = 100) => {
    time += dt;
    const e = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'changedTouches', { value: [{ clientX: x, clientY: y }] });
    document.querySelector(selector)!.dispatchEvent(e);
    return e.defaultPrevented;
  };
  return { tap };
}

describe('preventPageZoom', () => {
  it('cancels the second quick tap in the same spot (double-tap zoom)', () => {
    const { tap } = setup();
    expect(tap('#crouch', 1000)).toBe(false);
    expect(tap('#crouch', 150)).toBe(true);
  });

  it('lets slow taps and quick taps in different places through', () => {
    const { tap } = setup();
    tap('#crouch', 1000);
    expect(tap('#crouch', 500)).toBe(false);
    // Кнопка «Поза», затем сразу пункт колеса в стороне — обычные нажатия.
    expect(tap('#crouch', 120, 300, 100)).toBe(false);
  });

  it('keeps double-tap in text fields (selects a word)', () => {
    const { tap } = setup();
    tap('#nick', 1000);
    expect(tap('#nick', 150)).toBe(false);
  });
});
