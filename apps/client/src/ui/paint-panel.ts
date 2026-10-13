import { BODY_ZONES, type BodyZone } from '@mecha/shared';
import type { Painter } from '../painting/painter';
import { $ } from './dom';

/**
 * Панель покраски: силуэт из 6 кнопок-зон, текущий цвет, пипетка, недавние цвета.
 * Кнопка зоны окрашена в её текущий цвет — сразу видно, что уже перекрашено.
 */
export class PaintPanel {
  private readonly toggleButton = $<HTMLButtonElement>('#paint-toggle');
  private readonly panel = $('#paint-panel');
  private readonly current = $('#paint-current');
  private readonly pickButton = $<HTMLButtonElement>('#paint-pick');
  private readonly recent = $('#paint-recent');
  private readonly hint = $('#pick-hint');
  private readonly zoneButtons = new Map<BodyZone, HTMLButtonElement>();
  private open = false;

  constructor(private readonly painter: Painter) {
    for (const zone of BODY_ZONES) {
      const button = $<HTMLButtonElement>(`[data-zone="${zone}"]`);
      button.addEventListener('click', () => void painter.paint([zone]));
      this.zoneButtons.set(zone, button);
    }
    $('#paint-all').addEventListener('click', () => void painter.paintAll());
    this.pickButton.addEventListener('click', () =>
      painter.picking ? painter.cancelPicking() : painter.startPicking(),
    );
    this.toggleButton.addEventListener('click', () => {
      this.open = !this.open;
      if (!this.open) painter.cancelPicking();
      this.render();
    });
    // Делегирование событий: один обработчик на контейнер вместо обработчика на каждую плашку.
    this.recent.addEventListener('click', (e) => {
      const color = (e.target as HTMLElement).dataset.color;
      if (color) painter.setColor(color);
    });
    painter.on('change', () => this.render());
  }

  render(): void {
    const allowed = this.painter.allowed;
    this.toggleButton.hidden = !allowed;
    this.panel.hidden = !allowed || !this.open;
    this.hint.hidden = !this.painter.picking;
    this.toggleButton.classList.toggle('active', this.open);
    if (!allowed) {
      this.painter.cancelPicking();
      return;
    }

    this.current.style.background = this.painter.color;
    this.pickButton.classList.toggle('active', this.painter.picking);
    for (const [zone, button] of this.zoneButtons) {
      button.style.background = this.painter.colorOf(zone);
    }

    const swatches = this.painter.recent.map((color) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.dataset.color = color;
      swatch.style.background = color;
      swatch.setAttribute('aria-label', `Цвет ${color}`);
      return swatch;
    });
    this.recent.replaceChildren(...swatches);
  }
}
