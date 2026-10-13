import { $ } from './dom';

let el: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Короткое всплывающее сообщение внизу экрана. Элемент ищем при первом вызове, а не при импорте модуля. */
export function toast(text: string, durationMs = 2500): void {
  el ??= $('#toast');
  const target = el;
  target.textContent = text;
  target.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (target.hidden = true), durationMs);
}
