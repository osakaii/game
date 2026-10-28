// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
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

describe('setupFullscreenButtons on iPhone', () => {
  it('keeps the button and explains «Add to Home Screen» instead of hiding it', async () => {
    const { setupFullscreenButtons, IOS_FULLSCREEN_HINT } = await import('../../src/platform/device');
    document.body.innerHTML = '<button data-fullscreen hidden>На весь экран</button>';
    // iPhone Safari: Fullscreen API для страниц нет.
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', configurable: true });
    const hints: string[] = [];
    setupFullscreenButtons((text) => hints.push(text));
    const button = document.querySelector<HTMLButtonElement>('[data-fullscreen]')!;
    expect(button.hidden).toBe(false);
    button.click();
    expect(hints).toEqual([IOS_FULLSCREEN_HINT]);
  });
});

describe('immerseOnPhone', () => {
  /** pointer: coarse — телефон (палец), fine — компьютер (мышь). */
  function device(touch: boolean, fullscreenEnabled: boolean, userAgent = 'Mozilla/5.0 (Linux; Android 14)') {
    window.matchMedia = ((query: string) => ({ matches: query.includes('coarse') ? touch : false })) as typeof window.matchMedia;
    Object.defineProperty(document, 'fullscreenEnabled', { value: fullscreenEnabled, configurable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
    const request = vi.fn(async () => {});
    document.documentElement.requestFullscreen = request;
    return request;
  }

  it('Android phone: entering a room goes fullscreen right away — the browser bar is gone', async () => {
    const { immerseOnPhone } = await import('../../src/platform/device');
    const request = device(true, true);
    immerseOnPhone(() => {});
    expect(request).toHaveBeenCalledOnce();
  });

  it('computer: no fullscreen without asking', async () => {
    const { immerseOnPhone } = await import('../../src/platform/device');
    const request = device(false, true);
    immerseOnPhone(() => {});
    expect(request).not.toHaveBeenCalled();
  });

  it('iPhone: explains «Add to Home Screen» once per session', async () => {
    const { immerseOnPhone, IOS_FULLSCREEN_HINT } = await import('../../src/platform/device');
    device(true, false, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    const hints: string[] = [];
    immerseOnPhone((text) => hints.push(text));
    immerseOnPhone((text) => hints.push(text));
    expect(hints).toEqual([IOS_FULLSCREEN_HINT]);
  });
});
