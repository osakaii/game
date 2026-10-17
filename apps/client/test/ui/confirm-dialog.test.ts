// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ConfirmDialog } from '../../src/ui/confirm-dialog';

function setup() {
  document.body.innerHTML = `
    <div id="confirm" hidden>
      <div class="card"><p id="confirm-text"></p><button id="confirm-cancel"></button><button id="confirm-ok"></button></div>
    </div>`;
  return new ConfirmDialog();
}

const el = (selector: string) => document.querySelector<HTMLElement>(selector)!;

describe('ConfirmDialog', () => {
  it('resolves true on OK and hides', async () => {
    const dialog = setup();
    const answer = dialog.ask('Выйти?', 'Выйти');
    expect(el('#confirm').hidden).toBe(false);
    expect(el('#confirm-ok').textContent).toBe('Выйти');
    el('#confirm-ok').click();
    await expect(answer).resolves.toBe(true);
    expect(el('#confirm').hidden).toBe(true);
  });

  it('treats cancel and a tap outside the card as «no»', async () => {
    const dialog = setup();
    const first = dialog.ask('Выйти?', 'Выйти');
    el('#confirm-cancel').click();
    await expect(first).resolves.toBe(false);

    const second = dialog.ask('Выйти?', 'Выйти');
    el('#confirm').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await expect(second).resolves.toBe(false);
  });

  it('a new question rejects the pending one', async () => {
    const dialog = setup();
    const first = dialog.ask('Первый?', 'Да');
    const second = dialog.ask('Второй?', 'Да');
    await expect(first).resolves.toBe(false);
    el('#confirm-ok').click();
    await expect(second).resolves.toBe(true);
  });
});
