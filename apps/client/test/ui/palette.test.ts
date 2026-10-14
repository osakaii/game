// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/emitter';
import { Palette } from '../../src/ui/palette';

/** Подставная Мастерская: только то, что палитра читает и вызывает. */
class FakeStudio extends Emitter<{ change: void; edited: void }> {
  active = true;
  colorHex = '#e63946';
  opacity = 1;
  reference: string | null = null;
  setColor(hex: string) {
    this.colorHex = hex;
    this.emit('change', undefined);
  }
  setOpacity(value: number) {
    this.opacity = value;
    this.emit('change', undefined);
  }
}

function setup() {
  document.body.innerHTML = `
    <div id="palette" hidden>
      <canvas id="palette-sv"></canvas><canvas id="palette-hue"></canvas>
      <input type="range" id="palette-opacity" min="0.05" max="1" step="0.05" />
      <span id="cmp-brush"></span><span id="cmp-bg"></span><span id="cmp-label"></span>
      <input id="palette-hex" /><button id="palette-save"></button>
      <div id="palette-saved"></div>
    </div>`;
  const studio = new FakeStudio();
  const palette = new Palette(studio as never);
  palette.toggle();
  const q = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
  return { studio, palette, q };
}

describe('Palette', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('applies a typed #hex, restores the field on garbage', () => {
    const { studio, q } = setup();
    const hex = q<HTMLInputElement>('#palette-hex');
    hex.value = '#2A9D8F';
    hex.dispatchEvent(new Event('change'));
    expect(studio.colorHex).toBe('#2a9d8f');

    hex.value = 'zebra';
    hex.dispatchEvent(new Event('change'));
    expect(studio.colorHex).toBe('#2a9d8f');
    expect(hex.value).toBe('#2a9d8f');
  });

  it('saves colors across palette instances; long press removes', () => {
    vi.useFakeTimers();
    const first = setup();
    first.q('#palette-save').click();
    first.studio.setColor('#ffd400');
    first.q('#palette-save').click();
    expect([...first.q('#palette-saved').children].map((b) => (b as HTMLElement).dataset.color)).toEqual([
      '#ffd400',
      '#e63946',
    ]);

    const second = setup(); // «перезапуск игры»: новая палитра читает localStorage
    const swatch = second.q('#palette-saved').firstElementChild as HTMLElement;
    expect(swatch.dataset.color).toBe('#ffd400');
    swatch.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(second.q('#palette-saved').children).toHaveLength(1);
  });

  it('rates how close the brush color is to the picked background', () => {
    const { studio, q } = setup();
    expect(q('#cmp-label').textContent).toMatch(/Пипеткой/);
    studio.reference = '#7cb342';
    studio.setColor('#7cb342');
    expect(q('#cmp-label').dataset.level).toBe('perfect');
    studio.setColor('#e63946');
    expect(q('#cmp-label').dataset.level).toBe('far');
  });

  it('opacity slider drives the brush density', () => {
    const { studio, q } = setup();
    const slider = q<HTMLInputElement>('#palette-opacity');
    slider.value = '0.4';
    slider.dispatchEvent(new Event('input'));
    expect(studio.opacity).toBe(0.4);
  });

  it('closes itself when the studio closes', () => {
    const { studio, palette } = setup();
    studio.active = false;
    studio.emit('change', undefined);
    expect(palette.isOpen).toBe(false);
  });
});
