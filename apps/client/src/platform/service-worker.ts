/**
 * Регистрация service worker (`src/pwa/sw.js`, в сборке — `/sw.js`): игра остаётся в кэше телефона,
 * второй запуск не качает three.js заново, а пока Render будит сервер, игра открывается сразу.
 *
 * Только в prod: в dev Vite отдаёт модули на лету, кэш мешал бы видеть правки.
 * `updateViaCache: 'none'` — сам sw.js браузер проверяет на сервере при каждом запуске, мимо HTTP-кэша.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      /* приватный режим или старый браузер — играем без кэша, как раньше */
    });
  };
  // После load: установка качает всю игру (~1 МБ) — не отнимаем сеть у первого запуска.
  // main.ts доходит сюда после top-level await (карта, экран загрузки) — load к этому времени мог пройти,
  // и подписка на него не сработала бы никогда.
  if (document.readyState === 'complete') register();
  else addEventListener('load', register, { once: true });
}
