# @mecha/shared — общий код клиента и сервера

Чистый TypeScript без three.js и DOM: его исполняют и браузер, и Node. ESM — относительные импорты с `.js`.
Сборка `tsc -p tsconfig.build.json` → `dist/` (без типов Node). Всё экспортируется из `src/index.ts`.

## Модули
| Файл | Что внутри |
|---|---|
| `protocol.ts` | **Контракт сети**: карты событий `ServerToClientEvents` / `ClientToServerEvents`, `PROTOCOL_VERSION`, `SessionIdSchema`, `WelcomePayload` |
| `lobby.ts` | Схемы ника/кода комнаты (zod), `PlayerInfo`, `RoomSnapshot`, `ERROR_CODES`, `Result<T>` |
| `game.ts` | `GAME_RULES`, фазы (`lobby→hiding→seeking→results`), роли, `canMove`/`canPaint`/`canShoot`, число ищущих; `canPaint(phase, role, found)` — в лобби всем, в прятках и поиске — ненайденным прячущимся; `hasEndlessStamina(role)` — ищущий бегает без устали (`MoveInput.endlessStamina` → `tickStamina(…, endless)` держит запас полным) |
| `settings.ts` | `RoomSettings` (карта, время, ищущие, `foundMode`), опции для UI, `SCORING`; `defaultSeekSeconds(mapId)` (у карты своё `MapDef.seekSeconds`, иначе 150), `patchSettings` — сменили карту без времени поиска → время карты (сервер применяет через `Room.applySettings`) |
| `hints.ts` | Подсказки: `HINT_RULES` (раз в 30 с со второй половины поиска, в последнюю минуту — 15 с), `hintSchedule(seekSeconds)` → секунды от начала поиска, `HintPing` (событие `hint:ping`). Включаются `RoomSettings.hints` |
| `net-state.ts` | Позиции: `PlayerStateSchema`, `WorldSnapshot`, частоты (20 Гц), `INTERPOLATION_DELAY_MS`, схема выстрела `ShootSchema` |
| `physics.ts` | Детерминированная физика персонажа (`stepPlayer`, 60 Гц, цилиндр vs AABB, прыжок, присед, поза, бег — `MoveInput.sprint`, `PLAYER.sprintSpeed`; выносливость `STAMINA`, `canSprint`, `tickStamina` — общая с сервером), `bodyHeight`/`moveSpeed` (по приседу и позе), `keepBodyOutOfWalls` (лёжа: голова/ноги не в стене, длина — из хитбоксов), лазание (`climb` внутри `stepPlayer`, `wallContact` — нужна и серверу; `Aabb.noClimb` — внешние стены карт без потолка), `penetratesColliders`, `supportHeight`, `JUMP_HEIGHT` |
| `poses.ts` | Позы: `POSES`, `POSE_RULES` (высота, скорость ползком; 0 — «на месте»), `cancelsPose` (движение/прыжок снимают позу), `stanceKey` (stand/crouch/поза — ключ хитбоксов) |
| `raycast.ts` | Луч vs AABB (slab), `rayHitsBody` (луч в систему игрока по −yaw → коробки частей тела позы + `HIT_INFLATE`), `surfaceNormalAt` |
| `pose-hitboxes.ts` | **Сгенерировано** (`pnpm hitboxes`): `BODY_HITBOXES[stance]` — 14 коробок частей тела в системе игрока. Руками не править |
| `skin.ts` | Кожа: `SKIN_SIZE=512`, лимит байт, `SkinBase` (`default`/`seeker`, рисуется локально), `SkinState`, `detectSkinImage` (PNG/WebP по магическим байтам) |
| `body.ts` | `BODY_ZONES` — 14 частей тела (кости скелета и коробки атласа на клиенте; порядок = индекс в коже) |
| `telemetry.ts` | Телеметрия: `ClientReportSchema` (`perf` — FPS/просадки/устройство/качество, `error` — ошибка JS), лимиты `TELEMETRY_*`, `clip` (обрезать строку под схему) |
| `version.ts` | `APP_VERSION`, `BuildInfo`, `isUpdateAvailable` |
| `world/*` | Карты как данные: `map.ts` (`MapBox` с формой/поверхностью/`solid`/`hidden`, `mapBoxes`, `buildColliders` — только твёрдые), `props/` (мебель по комнатам → блоки; `index.ts` — реестр и `placeProp` с поворотом 0/90/180/270; `kit.ts` — `part/decor/collider`, ножки, ручки, швы, `seededRandom`), `layout.ts` (стены с проёмами и перемычками, обои и пол комнат изнутри), `ala-too/` (площадь Ала-Тоо — карта по умолчанию, 108 × 180 м: `kit.ts` — палитра и помощники, где `cy` — ЦЕНТР блока, как в исходном плане внешнего генератора, `block()` переводит в низ; `props.ts` — скамейка, клумба, дерево, киоск, урна, фонарь; `ala-too.ts` — план, сдвиг Z на +6, невидимые стены 30 м, ×3; `ALA_TOO_PASSAGES` — проходы, тест проверяет их `stepPlayer`), `apartment.ts` (квартира; план в обычных метрах, увеличен `scaleMap(…, APARTMENT_SCALE = 3)`), `builders.ts`, `playroom/kitchen/garden.ts`, реестр `maps.ts`. `MapBox.art` — зерно картины, `MapBox.glow` — светится без освещения (стекло, плафон), `MapDef.ceiling` — потолок, `texScale` — крупность рисунка у увеличенных карт |

## События протокола
C→S: `net:ping`, `room:create|join|leave|settings`, `game:start`, `player:state` (20 Гц, volatile), `player:skin` (бинарная картинка), `seek:shoot`, `client:report` (телеметрия, без ответа).
S→C: `net:welcome`, `room:state` (полный снимок комнаты при любом изменении), `world:snapshot` (20 Гц), `player:teleport`, `player:skin`, `seek:shot`, `hint:ping` (свист подсказки).

## Подводные камни
- Физика и карты общие: сервер валидирует движение тем же `stepPlayer`/`penetratesColliders`. Меняешь физику — проверь `move-validator`/`air-check` на сервере (`air-check` не считает полётом висение у стены — `wallContact`).
- Карта без потолка: внешние стены `noClimb` (по умолчанию в `perimeterWalls`), иначе через них уходят наружу. С потолком — `climbable = true` и скрытая плита потолка.
- Высота позы в `POSE_RULES` = потолок для физики и хитбокс. Модель клиента обязана в неё влезать (тест `player-model`): меняешь углы позы — тест скажет, если рука вылезла.
- Ступень уже диаметра игрока (лестница музея: 0.24 × 0.48 м): подъём на блок в `resolveHorizontal` — только когда блок под кругом опоры 0.95 r (как в `resolveVertical`), иначе игрок дрожит у края. Тест в `physics.test.ts`.
- `version.test.ts` читает `package.json` всех пакетов и `CHANGELOG.md` — версию меняй только через `pnpm release`.
