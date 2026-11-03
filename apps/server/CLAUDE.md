# @mecha/server — NestJS 12 + socket.io

Авторитетный сервер: всё состояние комнат в памяти процесса (один инстанс). Сборка `nest build` (tsconfig.build.json → `dist/`).
В продакшене раздаёт собранный клиент (`CLIENT_DIST`), gzip, кэш по хэшам; Docker + Render.

## Слои
**gateway** (сеть: валидация, ack, рассылка) → **service** (правила) → **Room** (доменная модель, без Nest/сокетов).
Сервисы не знают про сокеты: сообщают через `RoomEvents` (rxjs Subjects: `changed`, `playerLeft`, `teleported`, `shot`, `skin`, `hint`), gateway подписан в `afterInit`.

## Модули
| Папка/файл | Ответственность |
|---|---|
| `common/socket-types.ts` | Типы `GameServer/GameSocket`, `SocketData` (playerId, sessionId), `playerRoom(id)` — личная комната для адресной отправки, `GATEWAY_OPTIONS` (CORS) |
| `common/game-error.ts` | `GameError(code)`, `parseInput(zod, data)`, `respond(fn)` → `Result<T>` для ack |
| `common/rate-limit.ts` | `@RateLimit(perSec, burst)` + `RateLimitGuard` (token bucket, при отказе отвечает ack `RATE_LIMITED`) |
| `common/build-info.ts` | версия + коммит (`RENDER_GIT_COMMIT`/`APP_COMMIT`) |
| `session/` | Сессии: секретный `sessionId` (handshake auth) → публичный `playerId`, 60 с на переподключение (`RECONNECT_GRACE_MS`: телефон свернули или сменилась сеть), событие `expired` |
| `net/net.gateway.ts` | Middleware проверки сессии, connect/disconnect, `net:welcome` (+ `serverStartedAt` — клиент видит перезапуск сервера), пинг, возврат в комнату после переподключения |
| `rooms/room.ts` | **Доменная модель**: участники (`RoomMember`: позиция, роль, кожа, очки, история позиций, `watchedMs` — время под взглядом; `netPlayers` не рассылает `look`), фазы, настройки, спавны, снимки; `daytime` — новое время суток на каждый `startRound` (`pickDaytime`) |
| `rooms/rooms.service.ts` | Реестр комнат, create/join/leave, хост; `create(…, preferredCode)` — восстановить комнату под прежним кодом после перезапуска сервера (занят — `ROOM_EXISTS`, клиент входит в неё) |
| `rooms/rooms.gateway.ts` | `room:create/join/leave`, рассылка `room:state`/телепортов, выход по истечении сессии |
| `rooms/emit-skins.ts` | Отправить все кожи комнаты одному сокету (вход/переподключение) |
| `game/game.service.ts` | Автомат фаз (таймеры на объект Room), подсказки (`hintTimers`: всё расписание `hintSchedule` при старте поиска, снимаются в `finish`; свистят ненайденные подключённые прячущиеся с серверной позиции), очки за взгляд (`gazeTimers`: тик `GAZE_RULES.tickMs` во время поиска, `isWatching` по последнему принятому `state.look` ищущих → `Room.watch` копит `watchedMs` и отдаёт `GazeUpdate` при смене (и после переподключения: `setConnected(…, true)` ставит `watched = null` — клиент мог перезагрузить страницу и всё забыть) → `RoomEvents.gaze` → `gaze:update` в личную комнату прячущегося; в `roundPoints` они попадают в `finishRound`, и найденным тоже; `toSnapshot().gazePoints` — 0 до итогов, иначе ищущий видел бы, что смотрит на прячущегося), очередь ведущих, победа, настройки, `shoot` (lag compensation ≤300 мс), `uploadSkin` (по `canPaint` с `member.found`: прячущийся красится и во время поиска) |
| `game/game.gateway.ts` | `game:start`, `room:settings`, `seek:shoot`, `player:skin` |
| `game/shot.ts` | Ближайшее пересечение луча (пол, карта, прячущиеся по `rayHitsBody`: поза + yaw) — стены закрывают |
| `telemetry/` | `client:report` → `TelemetryService` (строка JSON в лог `client-perf`/`client-error`, последние 500 замеров и 50 разных ошибок в памяти), `GET /stats` — сводка (FPS медиана/p10, по видеокартам, уровни автокачества, ошибки); id игроков наружу не отдаются |
| `analytics/` | Статистика в Postgres (Neon): `AnalyticsService.track(event)` — в очередь, раз в 10 с одной пачкой (`MAX_BATCH` 500) в таблицу `events` (`at, type, player, room, version, data jsonb`; `PgSink` сам создаёт её при первой записи, вставка — `unnest` массивов-параметров). База лежит — пачка возвращается в очередь (не больше `MAX_QUEUE` 5000, старые теряются), игра не замечает; SIGTERM — дописать остаток. Нет `DATABASE_URL` — `NullSink`, статистика выключена (локально, CI, e2e). `player` — `playerKey(sessionId)` (хэш: sessionId — секрет, playerId меняется при перезапуске). События: `player_seen` (новая сессия, User-Agent; IP не храним), `room_created` (ник, `restored`), `room_joined` (ник), `round_started` (карта, игроки, ищущие), `round_finished` (карта, победитель, причина, найдено, секунды). Новое событие — имя в `EventType` и `track` в нужном месте, схема базы не меняется |
| `admin/` | Страница статистики `GET /stats/admin` (`admin-page.ts` — HTML одной строкой, без сборщика; цифры — скриптом, ники только через `textContent`) и `GET /stats/admin/api?days=1–90` (`AdminKeyGuard`: заголовок `X-Admin-Key` = `ADMIN_KEY`, сравнение `timingSafeEqual` по хэшам, 10 неверных за 10 мин — 429; нет `ADMIN_KEY` — 404). `AdminStatsService` — SQL по `events` через `EventSink.query`: дни по Бишкеку (`AT TIME ZONE 'Asia/Bishkek'`, не `'+06'` — это UTC−6), `GROUPING SETS` — дни + итог периода одним запросом, новые игроки — по первому `player_seen` за всё время, `fillDays` — пустые дни нулями. Под `/stats`, а не `/admin`: service worker игры пропускает `/stats*` мимо себя во всех версиях на телефонах |
| `movement/movement.gateway.ts` | Приём `player:state`: заморозка ищущих, `validateMove`, `checkAirborne`, история; 20 Гц снимки (ищущим в прятках — без прячущихся, призраки скрыты) |
| `movement/move-validator.ts`, `air-check.ts`, `stamina-check.ts`, `position-history.ts` | Античит скорости (по позе и бегу; `MoveBudget` — бюджет расстояния, копится со временем, а не запас к каждому пакету; верх — самый высокий коллайдер карты + 3 м, `topOf` кэширует)/стен (рост по позе)/полёта (2 с + `fallMs` — время честного падения с высоты отрыва: с флагштока 43 м падают дольше 2 с); бег — по серверной выносливости (`judgeSprint`/`recordSprint`, тратит на 15% медленнее клиента; ищущему — `endless`, бег принимается всегда), история позиций (с yaw, приседом, позой) для перемотки |

## Подводные камни
- `RoomMember extends Omit<PlayerInfo,'skin'>`: на сервере кожа хранит Buffer, клиенту уходит `SkinState`.
- `Room.teleport` обновляет принятую позицию, air-state, бюджет расстояния и историю — иначе валидатор примет следующий пакет за чит.
- Таймеры фаз — по объекту `Room` (не коду): после удаления комнаты код мог переиспользоваться.
- Тесты стрельбы/раундов (`game.service.test.ts`) ставят карту «Детская» явно: по умолчанию квартира со стенами, и координаты тестов упёрлись бы в стену.
- В тестах сервисы создаются напрямую (`new GameService(rooms, events, new AnalyticsService(new NullSink()))`), таймеры — `vi.useFakeTimers()`. Проверить события — `RecordingSink` из `test/analytics/recording-sink.ts` и `await analytics.flush()`.
- Локально статистика выключена: продовую `DATABASE_URL` в dev не ставь — тестовые комнаты попадут в цифры (`pnpm dev` `.env.local` не читает). Проверка с базой — Neon-ветка `dev` (проект `wispy-dream-81845986`, привязка в `.neon`, строка в `.env.local` — оба в `.gitignore`; новая строка — `neon checkout dev`): `pnpm build`, затем в `apps/server` `PORT=3311 ADMIN_KEY=… node --env-file=../../.env.local dist/main.js`, `E2E_URL=http://localhost:3311 pnpm e2e`, через 10 с события в `events` и в `/stats/admin/api`. Ветку `dev` можно сбросить к production (`neon branches reset dev --parent`).
