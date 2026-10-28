/** Как попасть в полный экран на iPhone: другого способа Apple не даёт. */
export const IOS_FULLSCREEN_HINT = 'На iPhone без рамок — только с главного экрана: «Поделиться» → «На экран „Домой“», потом запускай игру с иконки';

/** Игра открыта с главного экрана как приложение (рамок браузера уже нет). */
export function isInstalledApp(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

/** iPhone/iPod (iPad умеет обычный fullscreen и сюда не попадает: у него fullscreenEnabled). */
function isIphone(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Полноэкранный режим. На Android после него можно зафиксировать альбомную ориентацию.
 * iPhone Safari не умеет fullscreen для страниц — полный экран даёт только «На экран «Домой»»
 * (manifest + apple-mobile-web-app-capable). Там кнопка остаётся, но по нажатию объясняет, как это сделать:
 * иначе игроки не знают, что так вообще можно.
 */
export function setupFullscreenButtons(hint: (text: string) => void): void {
  // Кнопок две (стартовое меню и меню игры) — все помечены data-fullscreen.
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-fullscreen]')];
  if (!document.fullscreenEnabled) {
    if (!isIphone() || isInstalledApp()) return;
    for (const button of buttons) {
      button.hidden = false;
      button.addEventListener('click', () => hint(IOS_FULLSCREEN_HINT));
    }
    return;
  }
  // Уже на весь экран — кнопка не нужна (выйти можно жестом системы).
  const render = () => buttons.forEach((button) => (button.hidden = !!document.fullscreenElement));
  document.addEventListener('fullscreenchange', render);
  render();
  for (const button of buttons) button.addEventListener('click', () => void enterFullscreen());
}

/** Полный экран и альбомная ориентация. Только из обработчика нажатия: без жеста браузер откажет. */
async function enterFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // lock есть не во всех браузерах и не во всех типах (TS знает о нём не везде) — вызываем осторожно.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape').catch(() => {});
  } catch {
    /* пользователь отказал или браузер не разрешил — играем как есть */
  }
}

/** Подсказку про «Домой» на iPhone показываем раз за сессию — дальше она только мешала бы. */
let homeScreenHintShown = false;

/**
 * Вход в игру на телефоне: панель браузера сверху съедает четверть альбомного экрана.
 * Android — сразу полный экран (вход в комнату — нажатие, браузер это разрешит; искать кнопку не нужно).
 * iPhone — Safari панель не прячет ни по какому API, единственный путь — «На экран „Домой“»: подсказываем.
 * На компьютере полный экран без спроса раздражает — только телефоны (палец — основное устройство ввода).
 * Вызывать синхронно из обработчика нажатия «Создать»/«Войти».
 */
export function immerseOnPhone(hint: (text: string) => void): void {
  if (!matchMedia('(pointer: coarse)').matches || isInstalledApp()) return;
  if (document.fullscreenEnabled) {
    if (!document.fullscreenElement) void enterFullscreen();
  } else if (isIphone() && !homeScreenHintShown) {
    homeScreenHintShown = true;
    hint(IOS_FULLSCREEN_HINT);
  }
}

/** Два касания быстрее этого и ближе DOUBLE_TAP_PX друг к другу браузер считает двойным тапом и приближает. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 40;

/**
 * Запрет масштабирования страницы жестами.
 *
 * iOS Safari игнорирует `user-scalable=no` в meta viewport (ради доступности) и приближает страницу
 * по двойному тапу — например, если быстро нажать «Присесть» два раза. Отдалить обратно нельзя:
 * щипок в игре отключён (`touch-action: none`), он нужен для управления. Поэтому гасим сам жест:
 * второе касание в том же месте сразу после первого — preventDefault на touchend.
 * Кнопки игры работают на pointerdown, и на них это не влияет; поля ввода не трогаем — там двойной
 * тап выделяет слово.
 */
export function preventPageZoom(target: Document | HTMLElement = document, now: () => number = () => performance.now()): void {
  let last = { time: -Infinity, x: 0, y: 0 };
  target.addEventListener(
    'touchend',
    (e) => {
      const touch = (e as TouchEvent).changedTouches?.[0];
      if (!touch) return;
      const time = now();
      const near = Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < DOUBLE_TAP_PX;
      if (time - last.time < DOUBLE_TAP_MS && near && !isTextField(e.target)) e.preventDefault();
      last = { time, x: touch.clientX, y: touch.clientY };
    },
    // passive: false — иначе браузер не даст отменить жест (по умолчанию touch-слушатели пассивные).
    { passive: false },
  );
  // Щипок на iOS — нестандартное событие Safari gesturestart.
  target.addEventListener('gesturestart', (e) => e.preventDefault());
  target.addEventListener('dblclick', (e) => e.preventDefault());
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input:not([type="range"]), textarea, select');
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
