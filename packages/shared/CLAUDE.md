# @mecha/shared — общий код клиента и сервера

Чистый TypeScript без three.js и DOM: его исполняют и браузер, и Node. ESM — относительные импорты с `.js`.
Сборка `tsc -p tsconfig.build.json` → `dist/` (без типов Node). Всё экспортируется из `src/index.ts`.

## Модули
| Файл | Что внутри |
|---|---|
| `protocol.ts` | **Контракт сети**: карты событий `ServerToClientEvents` / `ClientToServerEvents`, `PROTOCOL_VERSION`, `SessionIdSchema`, `WelcomePayload` |
| `lobby.ts` | Схемы ника/кода комнаты (zod), `PlayerInfo`, `RoomSnapshot`, `ERROR_CODES`, `Result<T>` |
| `game.ts` | `GAME_RULES`, фазы (`lobby→hiding→seeking→results`), роли, `canMove`/`canPaint`/`canShoot`, число ищущих |
| `settings.ts` | `RoomSettings` (карта, время, ищущие, `foundMode`), опции для UI, `SCORING` |
| `net-state.ts` | Позиции: `PlayerStateSchema`, `WorldSnapshot`, частоты (20 Гц), `INTERPOLATION_DELAY_MS`, схема выстрела `ShootSchema` |
| `physics.ts` | Детерминированная физика персонажа (`stepPlayer`, 60 Гц, цилиндр vs AABB, прыжок, присед), `penetratesColliders`, `supportHeight`, `JUMP_HEIGHT` |
| `raycast.ts` | Луч vs AABB (slab), хитбокс игрока, `surfaceNormalAt` |
| `skin.ts` | Кожа: `SKIN_SIZE=512`, лимит байт, `SkinBase` (`default`/`seeker`, рисуется локально), `SkinState`, `detectSkinImage` (PNG/WebP по магическим байтам) |
| `body.ts` | `BODY_ZONES` — 14 частей тела (кости скелета и коробки атласа на клиенте; порядок = индекс в коже) |
| `version.ts` | `APP_VERSION`, `BuildInfo`, `isUpdateAvailable` |
| `world/*` | Карты как данные (коробки AABB): `map.ts` типы, `builders.ts` (стол, стул, дерево…), `playroom/kitchen/garden.ts`, реестр `maps.ts` |

## События протокола
C→S: `net:ping`, `room:create|join|leave|settings`, `game:start`, `player:state` (20 Гц, volatile), `player:skin` (бинарная картинка), `seek:shoot`.
S→C: `net:welcome`, `room:state` (полный снимок комнаты при любом изменении), `world:snapshot` (20 Гц), `player:teleport`, `player:skin`, `seek:shot`.

## Подводные камни
- Физика и карты общие: сервер валидирует движение тем же `stepPlayer`/`penetratesColliders`. Меняешь физику — проверь `move-validator`/`air-check` на сервере.
- `version.test.ts` читает `package.json` всех пакетов и `CHANGELOG.md` — версию меняй только через `pnpm release`.
