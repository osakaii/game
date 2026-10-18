/**
 * Полноэкранный режим. На Android после него можно зафиксировать альбомную ориентацию.
 * iPhone Safari не умеет fullscreen для страниц — там кнопку прячем,
 * а полный экран даёт «Добавить на главный экран» (manifest + apple-mobile-web-app-capable).
 */
export function setupFullscreenButtons(): void {
  if (!document.fullscreenEnabled) return;
  // Кнопок две (стартовое меню и меню игры) — все помечены data-fullscreen.
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-fullscreen]')];
  // Уже на весь экран — кнопка не нужна (выйти можно жестом системы).
  const render = () => buttons.forEach((button) => (button.hidden = !!document.fullscreenElement));
  document.addEventListener('fullscreenchange', render);
  render();
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        // lock есть не во всех браузерах и не во всех типах (TS знает о нём не везде) — вызываем осторожно.
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        await orientation.lock?.('landscape').catch(() => {});
      } catch {
        /* пользователь отказал или браузер не разрешил — играем как есть */
      }
    });
  }
}

/**
 * Wake Lock: не даём экрану погаснуть, пока игрок в комнате.
 * Прячущийся может не трогать экран минуты — без этого телефон уснёт, сокет оборвётся.
 *
 * Браузер сам снимает блокировку, когда вкладка уходит в фон. Поэтому при возврате
 * (visibilitychange) запрашиваем её снова. Работает только по https.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted) void this.acquire();
    });
  }

  set enabled(value: boolean) {
    if (value === this.wanted) return;
    this.wanted = value;
    if (value) void this.acquire();
    else void this.release();
  }

  private async acquire() {
    if (!('wakeLock' in navigator) || this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => (this.sentinel = null));
    } catch {
      /* нет https, режим энергосбережения — не критично */
    }
  }

  private async release() {
    await this.sentinel?.release();
    this.sentinel = null;
  }
}
