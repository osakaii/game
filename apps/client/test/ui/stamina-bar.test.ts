// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { StaminaBar } from '../../src/ui/stamina-bar';

function setup() {
  document.body.innerHTML = '<div id="stamina" hidden><div id="stamina-fill"></div></div>';
  return { bar: new StaminaBar(), root: document.querySelector<HTMLElement>('#stamina')!, fill: document.querySelector<HTMLElement>('#stamina-fill')! };
}

describe('StaminaBar', () => {
  it('hidden at full stamina, shown while spending or refilling', () => {
    const { bar, root, fill } = setup();
    bar.update(1, false);
    expect(root.hidden).toBe(true);
    bar.update(0.6, true);
    expect(root.hidden).toBe(false);
    expect(fill.style.transform).toBe('scaleX(0.6)');
    bar.update(0.8, false); // отдыхает — полоска ещё видна, пока не наполнится
    expect(root.hidden).toBe(false);
  });

  it('turns red when nearly empty', () => {
    const { bar, root } = setup();
    bar.update(0.2, true);
    expect(root.classList.contains('low')).toBe(true);
    bar.update(0.5, false);
    expect(root.classList.contains('low')).toBe(false);
  });
});
