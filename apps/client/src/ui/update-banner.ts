import { $ } from './dom';

/**
 * Баннер «вышла новая версия».
 *
 * Мягкий режим — сервер обновился, но протокол совместим: играть можно, обновиться — по желанию.
 * Перезагрузка безопасна даже посреди раунда: сессия в sessionStorage, сервер вернёт в ту же комнату.
 *
 * Обязательный режим — протокол несовместим: без перезагрузки старый клиент не поймёт новый сервер.
 */
export class UpdateBanner {
  private readonly root = $('#update-banner');
  private readonly text = $('#update-text');
  private readonly closeButton = $<HTMLButtonElement>('#update-close');

  constructor() {
    $('#update-reload').addEventListener('click', () => location.reload());
    this.closeButton.addEventListener('click', () => (this.root.hidden = true));
  }

  showOptional(version: string): void {
    this.text.textContent = `Доступна новая версия игры (v${version})`;
    this.closeButton.hidden = false;
    this.root.hidden = false;
  }

  showRequired(): void {
    this.text.textContent = 'Игра обновилась — перезагрузи страницу, чтобы продолжить';
    this.closeButton.hidden = true;
    this.root.hidden = false;
  }
}
