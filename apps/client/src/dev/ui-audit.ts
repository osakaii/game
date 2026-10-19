/**
 * Проверка интерфейса для телефона (только dev): `__mecha.auditUi()` в консоли.
 *
 * Глазами легко пропустить, что кнопка ужалась до 30 px или уехала под соседнюю панель — особенно
 * на десятке экранов и нескольких размерах. Здесь это меряется: каждый видимый элемент управления
 * проверяется на размер под палец, на выход за экран и на то, не закрыт ли он чем-то сверху.
 */

export interface UiIssue {
  kind: 'small' | 'offscreen' | 'covered';
  target: string;
  detail: string;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Меньше этого палец промахивается (рекомендация Apple и Google — 44–48 px). */
export const MIN_TOUCH = 44;
/** Ползунок тянут по длине — по высоте ему хватает и меньшего. */
const MIN_SLIDER_HEIGHT = 20;

const CONTROLS = 'button, input, select, [role="button"]';
/**
 * Слои, которые перекрывают игру целиком: пока такой открыт, кнопки под ним закрыты нарочно.
 * Проверяем только самый верхний открытый слой (или всю страницу, если слоёв нет).
 */
const LAYERS = '.overlay, #room-sheet, #game-menu, #pose-wheel, #rotate-screen';

/** Насколько прямоугольник выходит за экран (px), 0 — целиком внутри. */
export function overflow(box: Box, width: number, height: number): number {
  return Math.max(0, -box.left, -box.top, box.right - width, box.bottom - height);
}

/** Короткое имя элемента для отчёта: #id, иначе тег.класс и начало текста. */
export function describe(el: Element): string {
  if (el.id) return `#${el.id}`;
  const cls = el.classList[0] ? `.${el.classList[0]}` : '';
  const text = el.textContent?.trim().slice(0, 16);
  return `${el.tagName.toLowerCase()}${cls}${text ? ` «${text}»` : ''}`;
}

function visible(el: HTMLElement): boolean {
  if (el.closest('[hidden]')) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** Закрыт ли центр элемента чем-то чужим (не им самим и не его потомком/предком). */
function coveredBy(el: HTMLElement, box: Box): Element | null {
  const x = (box.left + box.right) / 2;
  const y = (box.top + box.bottom) / 2;
  const top = document.elementFromPoint(x, y);
  if (!top || top === el || el.contains(top) || top.contains(el)) return null;
  // <label> вокруг поля — тот же элемент управления.
  if (top.closest('label')?.contains(el)) return null;
  return top;
}

/** Самый верхний открытый слой по z-index; при равенстве — тот, что позже в разметке. */
function topLayer(): ParentNode {
  let top: HTMLElement | null = null;
  let topZ = -Infinity;
  for (const layer of document.querySelectorAll<HTMLElement>(LAYERS)) {
    if (!visible(layer)) continue;
    const z = Number(getComputedStyle(layer).zIndex) || 0;
    if (z >= topZ) {
      top = layer;
      topZ = z;
    }
  }
  return top ?? document;
}

export function auditUi(): UiIssue[] {
  const issues: UiIssue[] = [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const el of topLayer().querySelectorAll<HTMLElement>(CONTROLS)) {
    if (!visible(el)) continue;
    const box = el.getBoundingClientRect();
    const name = describe(el);
    const slider = el instanceof HTMLInputElement && el.type === 'range';
    const tooSmall = slider ? box.height < MIN_SLIDER_HEIGHT : Math.min(box.width, box.height) < MIN_TOUCH;
    if (tooSmall) issues.push({ kind: 'small', target: name, detail: `${Math.round(box.width)}×${Math.round(box.height)}` });
    const out = overflow(box, width, height);
    if (out > 0.5) issues.push({ kind: 'offscreen', target: name, detail: `за краем на ${Math.round(out)} px` });
    else {
      const cover = coveredBy(el, box);
      if (cover) issues.push({ kind: 'covered', target: name, detail: `закрыт ${describe(cover)}` });
    }
  }
  return issues;
}
