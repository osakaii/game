import type { PaintStudio } from '../paint/paint-studio';
import type { SkinPainter } from '../paint/skin-painter';
import { $ } from './dom';
import { Palette } from './palette';

/** Панель Мастерской: палитра, недавние цвета, пипетка, размер и жёсткость кисти, отмена/повтор, «Готово». */
export class StudioToolbar {
  private readonly root = $('#studio');
  private readonly color = $<HTMLButtonElement>('#studio-color');
  private readonly palette: Palette;
  private readonly recent = $('#studio-recent');
  private readonly pick = $<HTMLButtonElement>('#studio-pick');
  private readonly size = $<HTMLInputElement>('#studio-size');
  private readonly hardness = $<HTMLInputElement>('#studio-hardness');
  private readonly undo = $<HTMLButtonElement>('#studio-undo');
  private readonly redo = $<HTMLButtonElement>('#studio-redo');

  constructor(
    private readonly studio: PaintStudio,
    private readonly painter: SkinPainter,
    onDone: () => void,
  ) {
    this.palette = new Palette(studio);
    this.color.addEventListener('click', () => {
      this.palette.toggle();
      this.render();
    });
    // input — пока ползунок двигают, change — когда отпустили. Для размера нужен живой отклик.
    this.size.addEventListener('input', () => (studio.radius = Number(this.size.value) / 100));
    this.hardness.addEventListener('input', () => (studio.hardness = Number(this.hardness.value)));
    this.pick.addEventListener('click', () => studio.setTool(studio.tool === 'eyedropper' ? 'brush' : 'eyedropper'));
    this.undo.addEventListener('click', () => studio.undo());
    this.redo.addEventListener('click', () => studio.redo());
    $('#studio-done').addEventListener('click', onDone);
    this.recent.addEventListener('click', (e) => {
      const hex = (e.target as HTMLElement).dataset.color;
      if (hex) studio.setColor(hex);
    });
    studio.on('change', () => this.render());
    this.render();
  }

  render(): void {
    const s = this.studio;
    this.root.hidden = !s.active;
    document.body.classList.toggle('studio-open', s.active);
    if (!s.active) return;

    this.color.style.background = s.colorHex;
    this.color.style.opacity = String(0.35 + 0.65 * s.opacity); // видно, что краска полупрозрачная
    this.color.classList.toggle('open', this.palette.isOpen);
    this.size.value = String(Math.round(s.radius * 100 * 2) / 2);
    this.hardness.value = String(s.hardness);
    this.pick.classList.toggle('active', s.tool === 'eyedropper');
    this.undo.disabled = !this.painter.canUndo;
    this.redo.disabled = !this.painter.canRedo;

    const swatches = s.recent.map((hex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = hex;
      b.style.background = hex;
      b.setAttribute('aria-label', `Цвет ${hex}`);
      return b;
    });
    this.recent.replaceChildren(...swatches);
  }
}
