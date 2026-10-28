# Mecha — контекст для ИИ

Мобильная браузерная мультиплеерная игра «прятки с покраской» (по мотивам Meccha Chameleon).
Прячущиеся раскрашивают себя кистью под окружение, ищущие тапают по подозрительным местам.
Пользователь учится: работаем поэтапно, после этапа — краткий разбор (что, понятия, файлы, задание).

## Стек и раскладка
- pnpm-монорепо: `packages/shared` (протокол, физика, карты — чистый TS, без three.js), `apps/server` (NestJS 12 + socket.io), `apps/client` (Vite 8 + three.js 0.186, без фреймворка UI).
- TypeScript ~6.0 (не 7: Nest CLI зафиксирован на 6). Node 24. Сервер — CommonJS (`module: nodenext`), shared — ESM (импорты с `.js`).
- В каждом пакете свой `CLAUDE.md` с картой модулей — читай его перед правками в пакете.

## Команды
```
pnpm dev         # shared (watch) + сервер :3000 + клиент :5173 (Vite проксирует /socket.io)
pnpm test        # vitest на весь монорепо
pnpm typecheck   # tsc по всем пакетам (src + test)
pnpm build       # shared -> client -> server
pnpm release <major|minor|patch>   # версия + CHANGELOG (коммит/тег делаешь сам)
pnpm hitboxes    # пересчитать хитбоксы поз из модели (после правки поз или формы тела)
```
После правок shared нужен его build (в dev — watch делает сам), иначе сервер/клиент видят старый `dist`.

## Правила проекта
- **Сервер — источник правды.** Клиенту не доверяем: всё из сети валидируется zod-схемой из shared (`parseInput`) или проверкой байтов. Клиент шлёт намерения (луч, позицию, картинку), сервер решает.
- **Протокол только в `packages/shared/src/protocol.ts`.** Меняешь формат сообщения — подними `PROTOCOL_VERSION` (сейчас 14). Запрос с ответом = socket.io ack, ответ `Result<T>` (`{ok:true,data} | {ok:false,error:ErrorCode}`).
- **Новый `ErrorCode`** → добавить текст в `apps/client/src/ui/error-messages.ts` (`Record` заставит).
- **Тесты** — в `<пакет>/test/`, зеркально `src/` (`src/skin/atlas.ts` → `test/skin/atlas.test.ts`). DOM-тесты: первой строкой `// @vitest-environment happy-dom`. Сборка (`tsconfig.build.json`) берёт только `src/`.
- **Комментарии и UI — на русском**, комментарий объясняет «почему», а не «что».
- **Версия** одна на монорепо: `packages/shared/src/version.ts` + все `package.json` (тест сверяет). Изменения пиши в `CHANGELOG.md` → `[Unreleased]`.
- **Git:** коммит по просьбе пользователя, сообщение conventional (`feat:`, `fix:`, `chore:`) на английском. Push в `main` = автодеплой на Render (`render.yaml`, Docker, один инстанс — комнаты в памяти).

## Рецепты
- **Новое событие:** тип в `protocol.ts` (+ zod-схема, если C→S) → обработчик в gateway (`@SubscribeMessage`, `@RateLimit`, `respond(() => …)`) → логика в сервисе → метод в `apps/client/src/net/network.ts` → `PROTOCOL_VERSION++`.
- **Сервис хочет что-то разослать** (например, по таймеру): `RoomEvents` (rxjs Subject) в `apps/server/src/rooms/room-events.ts`, gateway подписан в `afterInit`.
- **Новая карта:** файл в `packages/shared/src/world/`, добавить в `MAP_IDS`/`MAPS` (`maps.ts`); `maps.test.ts` сам проверит спавны. Жильё с комнатами — через `layout.ts` (`buildWalls` + `finishRoom`), пример — `apartment.ts` (план в обычных метрах, `scaleMap` увеличивает мир, персонаж остаётся 1.6 м); тест проходимости комнат там же.
- **Новый предмет мебели:** функция в файле комнаты `shared/src/world/props/` (`living/kitchen/bedroom/bathroom/misc.ts`, детали — `kit.ts`) — блоки в своей системе (центр основания в 0, «лицом» к +Z); твёрдое — коллайдер, `solid: false` — только вид, `hidden` — только физика.
- **Новая настройка комнаты:** `RoomSettingsSchema` в `shared/src/settings.ts` → `SettingsDialog` на клиенте.

## Проверка в браузере (важно)
- Dev-хук: `window.__mecha` (player, lobby, network, studio, skinPainter, remotePlayers, sceneContext, controls…). В prod вырезается.
- Если панель браузера скрыта — `requestAnimationFrame` не идёт: кадры рисуй вручную (`sceneContext.renderer.render(scene, camera)`), шаги симуляции вызывай сами (`skinPainter.update(1/30)`).
- Снимок canvas: `canvas.toDataURL()` сразу после `render()` → POST на локальный приёмник (python http.server в scratchpad на :8765) → смотреть jpg.
- Сокет-e2e: node-скрипт с `socket.io-client` (`apps/client/node_modules/socket.io-client/build/esm-debug/index.js`), `auth: { sessionId }` обязателен (16–64 символа `[A-Za-z0-9_-]`).
- Dev-сервер Nest перезапускается при правках → комнаты в памяти пропадают.
- `apps/client/src/main.ts` большой и плоский: вставляя код скриптом «после строки X», проверь, что X не внутри обработчика (так уже дважды ломалось). После правки — `grep` на дубли объявлений.
- Dev-клавиши: U — атлас кожи, H — коробки попаданий.
- Скрытая панель браузера = canvas 0×0: перед ручным рендером `renderer.setSize(1024, 768, false)` и `camera.aspect`.
- Телефон в браузере: `resize_window` эмулирует тач (`pointer: coarse`) только при ширине < 768 — альбомный телефон проверяй как 740×340. Игра только альбомная (портрет закрыт `#rotate-screen`).
- Проверка интерфейса: `__mecha.auditUi()` — кнопки меньше 44 px, за краем экрана, закрытые чужим элементом (только верхний открытый слой). Прогоняй на 640×300 (маленький Android) и 740×340; в скрытой панели отключи анимации (`*{animation:none!important}`) — иначе шторки «застывают» на первом кадре и дают ложные срабатывания.
- HUD: `localStorage['mecha:debug']` — `'1'` подробный HUD и в prod, `'0'` HUD игрока даже в dev.
- Dev-флаг `localStorage['mecha:wet8bit']='1'` — принудительно 8-битный мокрый слой (режим слабых телефонов).

## Статус
Версия **1.2.0** (тег `v1.2.0`) — выпущена и задеплоена на Render. Что в ней — `CHANGELOG.md`.
- 1.0.0: этапы 0–11 (лобби, физика, сеть, фазы, поиск, сессии, деплой, карты, присед, античит, визуал).
- 1.1.0: покраска кистью П1–П7, персонажи Ч1–Ч4, карта К1–К4 (квартира ×3), лазание по стенам, адаптация под телефон М1–М6.
- 1.2.0: телеметрия Н1 (`client:report` → лог + `/stats`), бег с выносливостью, античит скорости — бюджет расстояния (`MoveBudget`).
Дальше по плану «надёжность и скорость»: Н2 холодный старт Render — отложен пользователем (варианты: будильник GitHub Actions + экран «просыпается», клиент на отдельном хостинге, платный тариф), Н3 слабые телефоны по данным `/stats`. Н4 сеть ✔ (сторож связи, переподключение при возврате во вкладку, 60 с на возврат, восстановление комнаты с прежним кодом после перезапуска сервера; живой прогон перезапуска — на проверке).
Новые изменения — в `CHANGELOG.md` → `[Unreleased]`; push в `main` = деплой, поэтому пушим по команде пользователя.
