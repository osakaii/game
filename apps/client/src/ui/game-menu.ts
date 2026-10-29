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
 * Кнопки звука и теней подписывает main.ts.
 */
export class GameMenu {
  private readonly button = $<HTMLButtonElement>('#menu-button');
  private readonly root = $('#game-menu');
  private readonly slider = $<HTMLInputElement>('#look-sensitivity');
  private readonly sliderValue = $('#look-sensitivity-value');
  private readonly leaveButton = $<HTMLButtonElement>('#leave-room');

  constructor(handlers: GameMenuHandlers, sensitivity: number, version: string) {
    this.button.addEventListener('click', () => this.setOpen(!this.open));
    $('#game-menu-close').addEventListener('click', () => this.setOpen(false));
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.setOpen(false);
    });
    this.leaveButton.addEventListener('click', () => {
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

  /**
   * Кнопка ☰ и «Выйти» — только в комнате. На главном экране та же шторка открывается шестерёнкой
   * (MenuScreen → setOpen): настройки одни, просто без выхода.
   */
  setAvailable(available: boolean): void {
    this.button.hidden = !available;
    this.leaveButton.hidden = !available;
    if (!available) this.setOpen(false);
  }

  private renderSensitivity() {
    this.sliderValue.textContent = `×${Number(this.slider.value).toFixed(1)}`;
  }
}
