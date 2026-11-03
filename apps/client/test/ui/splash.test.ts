// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hideSplash, nextPaint, setSplashStage } from '../../src/ui/splash';

const el = (id: string) => document.getElementById(id);

describe('splash', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="splash"><div id="splash-fill"></div><div id="splash-text">качаем игру…</div></div>`;
  });
  afterEach(() => vi.useRealTimers());

  it('shows the stage; the bar only moves forward', () => {
    setSplashStage('строим площадь…', 0.75);
    expect(el('splash-text')!.textContent).toBe('строим площадь…');
    expect(el('splash-fill')!.style.width).toBe('75%');
    // Встроенный скрипт страницы мог уже продвинуть полоску дальше — назад она не прыгает.
    el('splash')!.dataset.progress = '0.8';
    setSplashStage('смешиваем краски…', 0.78);
    expect(el('splash-text')!.textContent).toBe('смешиваем краски…');
    expect(el('splash-fill')!.style.width).toBe('75%');
  });

  it('hides and removes itself even without a transition (reduced motion)', () => {
    vi.useFakeTimers();
    hideSplash();
    expect(el('splash')!.classList.contains('hidden')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(el('splash')).toBeNull();
    // Экрана уже нет — этапы и повторное скрытие ничего не ломают.
    expect(() => {
      setSplashStage('x', 1);
      hideSplash();
    }).not.toThrow();
  });

  it('nextPaint resolves even when frames do not run (hidden tab)', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const done = vi.fn();
    void nextPaint().then(done);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalled();
  });
});
