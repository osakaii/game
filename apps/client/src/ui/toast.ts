import { $ } from './dom';

const el = $('#toast');
let timer: ReturnType<typeof setTimeout> | undefined;

/** Короткое всплывающее сообщение внизу экрана. */
export function toast(text: string, durationMs = 2500): void {
  el.textContent = text;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (el.hidden = true), durationMs);
}
