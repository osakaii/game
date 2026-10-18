import { $ } from './dom';

interface GameMenuHandlers {
  onLeave(): void;
  onSensitivity(value: number): void;
}

/**
 * Меню игры по кнопке ☰: звук, тени, полный экран, чувствительность камеры, версия, выход.
 *
 * Игру оно не останавливает — это мультиплеер, остальные продолжают. Поэтому меню — шторка сбоку,
 * а не окно на весь экран: видно, что происходит, и закрыть можно тапом мимо.
 * Кнопки звука и теней подписывает main.ts (те же обработчики, что у стартового меню).
 */
export class GameMenu {
  private readonly button = $<HTMLButtonElement>('#menu-button');
  private readonly root = $('#game-menu');
  private readonly slider = $<HTMLInputElement>('#look-sensitivity');
  private readonly sliderValue = $('#look-sensitivity-value');

  constructor(handlers: GameMenuHandlers, sensitivity: number, version: string) {
    this.button.addEventListener('click', () => this.setOpen(!this.open));
    $('#game-menu-close').addEventListener('click', () => this.setOpen(false));
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.setOpen(false);
    });
    $('#leave-room').addEventListener('click', () => {
      this.setOpen(false);
      handlers.onLeave();
    });

    this.slider.value = String(sensitivity);
    this.renderSensitivity();
    this.slider.addEventListener('input', () => {
      this.renderSensitivity();
      handlers.onSensitivity(Number(this.slider.value));
    });
    // Версия здесь — игрок пришлёт скриншот меню вместе с багом.
    $('#game-menu-version').textContent = version;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
  }

  /** Кнопка ☰ есть только в комнате: в стартовом меню свои кнопки звука и теней. */
  setAvailable(available: boolean): void {
    this.button.hidden = !available;
    if (!available) this.setOpen(false);
  }

  private renderSensitivity() {
    this.sliderValue.textContent = `×${Number(this.slider.value).toFixed(1)}`;
  }
}
