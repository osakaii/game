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
| `rooms/room.ts` | **Доменная модель**: участники (`RoomMember`: позиция, роль, кожа, очки, история позиций), фазы, настройки, спавны, снимки |
| `rooms/rooms.service.ts` | Реестр комнат, create/join/leave, хост; `create(…, preferredCode)` — восстановить комнату под прежним кодом после перезапуска сервера (занят — `ROOM_EXISTS`, клиент входит в неё) |
| `rooms/rooms.gateway.ts` | `room:create/join/leave`, рассылка `room:state`/телепортов, выход по истечении сессии |
| `rooms/emit-skins.ts` | Отправить все кожи комнаты одному сокету (вход/переподключение) |
| `game/game.service.ts` | Автомат фаз (таймеры на объект Room), подсказки (`hintTimers`: всё расписание `hintSchedule` при старте поиска, снимаются в `finish`; свистят ненайденные подключённые прячущиеся с серверной позиции), очередь ведущих, победа, настройки, `shoot` (lag compensation ≤300 мс), `uploadSkin` (по `canPaint` с `member.found`: прячущийся красится и во время поиска) |
| `game/game.gateway.ts` | `game:start`, `room:settings`, `seek:shoot`, `player:skin` |
| `game/shot.ts` | Ближайшее пересечение луча (пол, карта, прячущиеся по `rayHitsBody`: поза + yaw) — стены закрывают |
| `telemetry/` | `client:report` → `TelemetryService` (строка JSON в лог `client-perf`/`client-error`, последние 500 замеров и 50 разных ошибок в памяти), `GET /stats` — сводка (FPS медиана/p10, по видеокартам, уровни автокачества, ошибки); id игроков наружу не отдаются |
| `movement/movement.gateway.ts` | Приём `player:state`: заморозка ищущих, `validateMove`, `checkAirborne`, история; 20 Гц снимки (ищущим в прятках — без прячущихся, призраки скрыты) |
| `movement/move-validator.ts`, `air-check.ts`, `stamina-check.ts`, `position-history.ts` | Античит скорости (по позе и бегу; `MoveBudget` — бюджет расстояния, копится со временем, а не запас к каждому пакету)/стен (рост по позе)/полёта; бег — по серверной выносливости (`judgeSprint`/`recordSprint`, тратит на 15% медленнее клиента; ищущему — `endless`, бег принимается всегда), история позиций (с yaw, приседом, позой) для перемотки |

## Подводные камни
- `RoomMember extends Omit<PlayerInfo,'skin'>`: на сервере кожа хранит Buffer, клиенту уходит `SkinState`.
- `Room.teleport` обновляет принятую позицию, air-state, бюджет расстояния и историю — иначе валидатор примет следующий пакет за чит.
- Таймеры фаз — по объекту `Room` (не коду): после удаления комнаты код мог переиспользоваться.
- Тесты стрельбы/раундов (`game.service.test.ts`) ставят карту «Детская» явно: по умолчанию квартира со стенами, и координаты тестов упёрлись бы в стену.
- В тестах сервисы создаются напрямую (`new GameService(rooms, events)`), таймеры — `vi.useFakeTimers()`.
