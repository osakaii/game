import { $ } from './dom';

/** Ниже этого запаса полоска краснеет: вот-вот перейдёшь на шаг. */
const LOW = 0.25;

/**
 * Полоска выносливости. Видна только когда силы не полные — полный запас показывать незачем,
 * на телефоне каждый пиксель экрана занят игрой. DOM трогаем, только когда значение заметно изменилось.
 */
export class StaminaBar {
  private readonly root = $('#stamina');
  private readonly fill = $('#stamina-fill');
  private shown = -1;

  update(stamina: number, sprinting: boolean): void {
    // Шаг 1%: чаще менять ширину бессмысленно, а запись в DOM — пересчёт вёрстки.
    const value = Math.round(stamina * 100) / 100;
    const visible = value < 1 || sprinting;
    if (this.root.hidden === visible) this.root.hidden = !visible;
    if (value === this.shown) return;
    this.shown = value;
    this.fill.style.transform = `scaleX(${value})`;
    this.root.classList.toggle('low', value < LOW);
  }
}
