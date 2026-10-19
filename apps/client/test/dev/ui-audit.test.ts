// @vitest-environment happy-dom
import { describe as suite, expect, it } from 'vitest';
import { describe, overflow } from '../../src/dev/ui-audit';

suite('ui-audit helpers', () => {
  it('measures how far a box sticks out of the screen', () => {
    expect(overflow({ left: 10, top: 10, right: 100, bottom: 50 }, 740, 340)).toBe(0);
    expect(overflow({ left: -12, top: 10, right: 40, bottom: 50 }, 740, 340)).toBe(12);
    expect(overflow({ left: 700, top: 300, right: 760, bottom: 352 }, 740, 340)).toBe(20);
  });

  it('names elements by id, otherwise by tag, class and text', () => {
    document.body.innerHTML = '<button id="jump"></button><button class="swatch big">Кисть для покраски</button>';
    const [byId, byClass] = document.querySelectorAll('button');
    expect(describe(byId)).toBe('#jump');
    // Текст обрезан до 16 символов — отчёт должен оставаться коротким.
    expect(describe(byClass)).toBe('button.swatch «Кисть для покрас»');
  });
});
