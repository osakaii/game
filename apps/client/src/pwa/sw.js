/**
 * Service worker Mecha — игра в кэше телефона.
 *
 * Не модуль и не TypeScript: Safari до сих пор не везде умеет service worker-модули, а сборщику он
 * не нужен — плагин `build/sw-plugin.ts` кладёт этот файл в `dist/sw.js` как есть и дописывает сверху
 * список файлов сборки (`__MECHA_PRECACHE__`) и имя кэша этой сборки (`__MECHA_CACHE__`).
 *
 * Стратегии:
 * - страница (`/`, `/?room=…`) — сначала сеть: после деплоя игрок сразу получает новую версию.
 *   Сеть молчит дольше NAVIGATION_TIMEOUT_MS (Render будит уснувший сервер до минуты), отвечает ошибкой
 *   (502 во время деплоя) или её нет — отдаём страницу из кэша: игра открывается сразу, сокет
 *   подключится, когда сервер проснётся;
 * - `/assets/*` — сначала кэш: в имени хэш содержимого, файл под этим именем не меняется никогда;
 * - остальное (иконки, manifest) — из кэша, а в фоне обновляем;
 * - сокет, `/health`, `/stats` — мимо: это живые данные, кэшировать их нельзя.
 */
const PRECACHE = self.__MECHA_PRECACHE__;
const CACHE = self.__MECHA_CACHE__;
const SHELL = '/';
const NAVIGATION_TIMEOUT_MS = 4000;
const PASS_THROUGH = ['/socket.io/', '/health', '/stats'];

self.addEventListener('install', (event) => {
  // skipWaiting: не ждём, пока закроют все вкладки. Старая вкладка живёт на своих файлах из памяти,
  // а о новой версии ей скажет сервер (баннер «Доступна новая версия»).
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Кэши прошлых сборок — мусор: three.js в каждом ~0.5 МБ, телефон не резиновый.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('mecha-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (PASS_THROUGH.some((prefix) => url.pathname.startsWith(prefix))) return;
  if (request.mode === 'navigate') event.respondWith(page(event));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request));
  else event.respondWith(staleWhileRevalidate(event));
});

/** Страница: сеть, если она ответила вовремя и без ошибки, иначе кэш. Свежий ответ кэш обновляет. */
async function page(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(SHELL, response.clone());
    return response;
  });
  // Ответ пришёл после таймаута — всё равно положим его в кэш к следующему запуску.
  event.waitUntil(network.catch(() => {}));
  const cached = await cache.match(SHELL);
  if (!cached) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
  const fresh = await Promise.race([network.then((response) => (response.ok ? response : null), () => null), timeout]);
  return fresh ?? cached;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  return cached ?? network;
}
