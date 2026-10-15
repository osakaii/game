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
| `physics.ts` | Детерминированная физика персонажа (`stepPlayer`, 60 Гц, цилиндр vs AABB, прыжок, присед, поза), `bodyHeight`/`moveSpeed` (по приседу и позе), `keepBodyOutOfWalls` (лёжа: голова/ноги не в стене, длина — из хитбоксов), `penetratesColliders`, `supportHeight`, `JUMP_HEIGHT` |
| `poses.ts` | Позы: `POSES`, `POSE_RULES` (высота, скорость ползком; 0 — «на месте»), `cancelsPose` (движение/прыжок снимают позу), `stanceKey` (stand/crouch/поза — ключ хитбоксов) |
| `raycast.ts` | Луч vs AABB (slab), `rayHitsBody` (луч в систему игрока по −yaw → коробки частей тела позы + `HIT_INFLATE`), `surfaceNormalAt` |
| `pose-hitboxes.ts` | **Сгенерировано** (`pnpm hitboxes`): `BODY_HITBOXES[stance]` — 14 коробок частей тела в системе игрока. Руками не править |
| `skin.ts` | Кожа: `SKIN_SIZE=512`, лимит байт, `SkinBase` (`default`/`seeker`, рисуется локально), `SkinState`, `detectSkinImage` (PNG/WebP по магическим байтам) |
| `body.ts` | `BODY_ZONES` — 14 частей тела (кости скелета и коробки атласа на клиенте; порядок = индекс в коже) |
| `version.ts` | `APP_VERSION`, `BuildInfo`, `isUpdateAvailable` |
| `world/*` | Карты как данные: `map.ts` (`MapBox` с формой/поверхностью/`solid`/`hidden`, `mapBoxes`, `buildColliders` — только твёрдые), `props/` (мебель по комнатам → блоки; `index.ts` — реестр и `placeProp` с поворотом 0/90/180/270; `kit.ts` — `part/decor/collider`, ножки, ручки, швы, `seededRandom`), `builders.ts`, `playroom/kitchen/garden.ts`, реестр `maps.ts` |

## События протокола
C→S: `net:ping`, `room:create|join|leave|settings`, `game:start`, `player:state` (20 Гц, volatile), `player:skin` (бинарная картинка), `seek:shoot`.
S→C: `net:welcome`, `room:state` (полный снимок комнаты при любом изменении), `world:snapshot` (20 Гц), `player:teleport`, `player:skin`, `seek:shot`.

## Подводные камни
- Физика и карты общие: сервер валидирует движение тем же `stepPlayer`/`penetratesColliders`. Меняешь физику — проверь `move-validator`/`air-check` на сервере.
- Высота позы в `POSE_RULES` = потолок для физики и хитбокс. Модель клиента обязана в неё влезать (тест `player-model`): меняешь углы позы — тест скажет, если рука вылезла.
- `version.test.ts` читает `package.json` всех пакетов и `CHANGELOG.md` — версию меняй только через `pnpm release`.
