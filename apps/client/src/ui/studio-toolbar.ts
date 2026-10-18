import type { PaintStudio, StudioTool } from '../paint/paint-studio';
import type { SkinPainter } from '../paint/skin-painter';
import { $ } from './dom';
import { Palette } from './palette';

/**
 * Панели Мастерской: сверху цвет, недавние цвета, отмена/повтор и «Готово»; слева колонка инструментов;
 * справа ползунки (размер, жёсткость, влажность), симметрия и «Глазами ищущего».
 * Персонажа камера держит в центре свободного места между колонками.
 */
export class StudioToolbar {
  private readonly root = $('#studio');
  private readonly color = $<HTMLButtonElement>('#studio-color');
  private readonly palette: Palette;
  private readonly recent = $('#studio-recent');
  private readonly toolButtons = [...document.querySelectorAll<HTMLButtonElement>('.studio-tools [data-tool]')];
  private readonly symmetry = $<HTMLButtonElement>('#studio-symmetry');
  private readonly preview = $<HTMLButtonElement>('#studio-preview');
  private readonly size = $<HTMLInputElement>('#studio-size');
  private readonly hardness = $<HTMLInputElement>('#studio-hardness');
  private readonly wetness = $<HTMLInputElement>('#studio-wetness');
  private readonly undo = $<HTMLButtonElement>('#studio-undo');
  private readonly redo = $<HTMLButtonElement>('#studio-redo');
  private readonly rail = $('.studio-rail');
  private readonly side = $('.studio-side');

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
    // Влажность — свойство самой краски на коже: меняет, как течёт и сохнет вся мокрая краска.
    this.wetness.addEventListener('input', () => painter.setWetness(Number(this.wetness.value)));
    painter.setWetness(Number(this.wetness.value));
    for (const button of this.toolButtons) {
      button.addEventListener('click', () => studio.setTool(button.dataset.tool as StudioTool));
    }
    this.symmetry.addEventListener('click', () => studio.setSymmetry(!studio.symmetry));
    this.preview.addEventListener('click', () => {
      studio.setPreview(!studio.previewing);
      this.palette.close();
    });
    this.undo.addEventListener('click', () => studio.undo());
    this.redo.addEventListener('click', () => studio.redo());
    $('#studio-done').addEventListener('click', onDone);
    this.recent.addEventListener('click', (e) => {
      const hex = (e.target as HTMLElement).dataset.color;
      if (hex) studio.setColor(hex);
    });
    studio.on('change', () => this.render());
    // Повернули экран, открылась клавиатура — свободное место между панелями другое.
    window.addEventListener('resize', () => this.updateScreenShift());
    this.render();
  }

  /**
   * Центр свободного места между левой и правой колонками — туда камера ставит персонажа.
   * Меряем вёрстку, а не считаем из CSS: размеры колонок зависят от экрана и шрифта.
   */
  private updateScreenShift() {
    const s = this.studio;
    if (!s.active || s.previewing || window.innerWidth === 0) {
      s.setScreenShift(0);
      return;
    }
    const rail = this.rail.getBoundingClientRect();
    const side = this.side.getBoundingClientRect();
    const left = rail.width > 0 ? rail.right : 0;
    const right = side.width > 0 ? side.left : window.innerWidth;
    s.setScreenShift(((left + right) / 2 - window.innerWidth / 2) / window.innerWidth);
  }

  render(): void {
    const s = this.studio;
    this.root.hidden = !s.active;
    document.body.classList.toggle('studio-open', s.active);
    if (!s.active) {
      document.body.classList.remove('studio-preview');
      this.updateScreenShift();
      return;
    }

    this.color.style.background = s.colorHex;
    this.color.style.opacity = String(0.35 + 0.65 * s.opacity); // видно, что краска полупрозрачная
    this.color.classList.toggle('open', this.palette.isOpen);
    this.size.value = String(Math.round(s.radius * 100 * 2) / 2);
    this.hardness.value = String(s.hardness);
    for (const button of this.toolButtons) button.classList.toggle('active', button.dataset.tool === s.tool);
    this.symmetry.classList.toggle('active', s.symmetry);
    this.symmetry.setAttribute('aria-pressed', String(s.symmetry));
    this.preview.classList.toggle('active', s.previewing);
    this.preview.textContent = s.previewing ? 'Вернуться к покраске' : 'Глазами ищущего';
    document.body.classList.toggle('studio-preview', s.previewing);
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
    this.updateScreenShift();
  }
}
