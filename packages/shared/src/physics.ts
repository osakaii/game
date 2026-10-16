import { clamp, type Vec3 } from './math.js';
import { BODY_HITBOXES } from './pose-hitboxes.js';
import { POSE_RULES, cancelsPose, stanceKey, type Pose } from './poses.js';
import type { Aabb } from './world/map.js';

/**
 * Физика персонажа. Общая для клиента и сервера, поэтому без three.js и без аллокаций в горячем цикле.
 *
 * Модель игрока — вертикальный цилиндр: position — точка у ног (центр основания).
 * Мир — набор AABB плюс пол на y = 0.
 */

/** Фиксированный шаг симуляции. Одинаковый dt = одинаковый результат на любом устройстве. */
export const PHYSICS_DT = 1 / 60;

export const PLAYER = {
  radius: 0.35,
  height: 1.6,
  walkSpeed: 5,
  /** м/с² — как быстро скорость догоняет желаемую. Меньше = «скользко». */
  acceleration: 40,
  /** Доля управления в воздухе. */
  airControl: 0.4,
  jumpSpeed: 7.5,
  gravity: 22,
  maxFallSpeed: 30,
  /** Ступеньки ниже этой высоты персонаж перешагивает без прыжка. */
  stepHeight: 0.35,
  /** Присед: пролезаем под столом (зазор под столешницей ~0.95 м). */
  crouchHeight: 0.9,
  crouchSpeed: 2.5,
  /** Скорость лазания по стене вверх и вбок (м/с). */
  climbSpeed: 2.4,
  /** Прыжок от стены: насколько сильно отталкивает от неё и подбрасывает вверх. */
  wallJumpPush: 4,
  wallJumpUp: 5.5,
} as const;

/** Что определяет рост и скорость тела: присед и поза. Поза важнее приседа. */
export interface BodyStance {
  crouching: boolean;
  pose?: Pose;
}

/** Высота тела: для столкновений с потолком, проверки сервера и хитбокса. */
export function bodyHeight(stance: BodyStance): number {
  if (stance.pose && stance.pose !== 'none') return POSE_RULES[stance.pose].height;
  return stance.crouching ? PLAYER.crouchHeight : PLAYER.height;
}

/** Наибольшая горизонтальная скорость в этом положении тела (м/с). */
export function moveSpeed(stance: BodyStance): number {
  if (stance.pose && stance.pose !== 'none') return POSE_RULES[stance.pose].speed;
  return stance.crouching ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
}

export interface PlayerPhysicsState {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  crouching: boolean;
  pose: Pose;
  /** Висит или лезет по стене. */
  climbing?: boolean;
  /** Нормаль стены, по которой лезет (от стены к игроку), — модель смотрит в стену. */
  wallNormal?: { x: number; z: number };
}

/** Желаемое направление в мировых координатах (длина 0..1), прыжок, присед и поза. */
export interface MoveInput {
  dirX: number;
  dirZ: number;
  jump: boolean;
  crouch: boolean;
  /** Какую позу игрок выбрал (по умолчанию — никакую). */
  pose?: Pose;
}

const EPS = 1e-4;
/** Насколько близко к стене (м сверх радиуса) — «касаюсь, могу ухватиться». */
const WALL_REACH = 0.08;
/**
 * Начать лезть — только толкая джойстик почти прямо в стену: идя вдоль коридора и задевая стену
 * под углом, на неё случайно не полезешь. Уже вися — держимся, пока джойстик не от стены.
 */
const CLIMB_START = 0.75;
const CLIMB_RELEASE = 0.35;
/** Руками достаём до края, если ноги на столько ниже верха предмета — забираемся на него. */
const MANTLE_REACH = 0.45;

/**
 * Стена, к которой прижат игрок: вертикальная грань коллайдера в пределах WALL_REACH от цилиндра.
 * Низкое (ковёр, ступенька) — не стена: на него наступают, а не лезут. Возвращает ближайшую.
 * Нужна и клиенту (лазание), и серверу (висящий на стене — не «летающий» читер).
 */
export function wallContact(position: Vec3, colliders: readonly Aabb[]): { nx: number; nz: number; box: Aabb } | null {
  let best: { nx: number; nz: number; box: Aabb } | null = null;
  let bestDistance = Infinity;
  const reach = PLAYER.radius + WALL_REACH;
  for (const b of colliders) {
    // Стена — то, что доходит почти до ног и выше ступеньки. Столешница на ножках — не стена:
    // её край висит над полом, за него не ухватишься снизу.
    if (b.noClimb || b.maxY - position.y <= PLAYER.stepHeight || b.minY > position.y + 0.5) continue;
    const cx = clamp(position.x, b.minX, b.maxX);
    const cz = clamp(position.z, b.minZ, b.maxZ);
    const dx = position.x - cx;
    const dz = position.z - cz;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-6 || distance > reach || distance >= bestDistance) continue;
    bestDistance = distance;
    best = { nx: dx / distance, nz: dz / distance, box: b };
  }
  return best;
}

/** Один шаг симуляции. Мутирует state — без новых объектов на каждый тик (меньше работы GC на телефоне). */
export function stepPlayer(state: PlayerPhysicsState, input: MoveInput, colliders: readonly Aabb[], dt: number): void {
  const v = state.velocity;

  // 0. Присед. Встать можно, только если над головой свободно — иначе под столом
  //    персонаж «вырос» бы сквозь столешницу.
  if (input.crouch) {
    state.crouching = true;
  } else if (state.crouching && !penetratesColliders(state.position, colliders, EPS, bodyHeight({ crouching: false, pose: state.pose }))) {
    state.crouching = false;
  }
  updatePose(state, input, colliders);
  if (climb(state, input, colliders, dt)) return;
  const speed = moveSpeed(state);

  // 1. Горизонтальная скорость плавно стремится к желаемой.
  let dirX = input.dirX;
  let dirZ = input.dirZ;
  const len = Math.hypot(dirX, dirZ);
  if (len > 1) {
    dirX /= len;
    dirZ /= len;
  }
  const diffX = dirX * speed - v.x;
  const diffZ = dirZ * speed - v.z;
  const diffLen = Math.hypot(diffX, diffZ);
  const maxDelta = PLAYER.acceleration * (state.grounded ? 1 : PLAYER.airControl) * dt;
  if (diffLen <= maxDelta) {
    v.x += diffX;
    v.z += diffZ;
  } else {
    v.x += (diffX / diffLen) * maxDelta;
    v.z += (diffZ / diffLen) * maxDelta;
  }

  // 2. Прыжок (не из приседа и не из позы) и гравитация.
  if (input.jump && state.grounded && !state.crouching && state.pose === 'none') {
    v.y = PLAYER.jumpSpeed;
    state.grounded = false;
  }
  v.y = Math.max(v.y - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);

  // 3. Сначала двигаемся по горизонтали и выталкиваемся из стен, потом по вертикали.
  //    Раздельные фазы — простой и устойчивый способ разрешать столкновения.
  state.position.x += v.x * dt;
  state.position.z += v.z * dt;
  resolveHorizontal(state, colliders);

  const prevY = state.position.y;
  state.position.y += v.y * dt;
  resolveVertical(state, prevY, colliders);
}

/**
 * Лазание. Упёрся в стену и толкаешь джойстик в неё — лезешь вверх; отпустил — висишь
 * (так прячутся высоко на стене, покрасившись под обои); джойстик от стены — отпускаешься;
 * прыжок — отталкиваешься от стены. Вдоль стены можно ползти вбок. Долез до верха предмета
 * (шкаф, холодильник) — забираешься на крышку. Потолок останавливает, как голову при прыжке.
 *
 * Возвращает true, если шаг полностью обработан здесь (игрок на стене или только что слез с неё прыжком).
 */
function climb(state: PlayerPhysicsState, input: MoveInput, colliders: readonly Aabb[], dt: number): boolean {
  const v = state.velocity;
  const height = bodyHeight(state);
  const wall = state.pose === 'none' ? wallContact(state.position, colliders) : null;
  if (!wall) {
    state.climbing = false;
    state.wallNormal = undefined;
    return false;
  }
  // «В стену» — проекция джойстика на направление к стене (минус нормаль).
  const push = -(input.dirX * wall.nx + input.dirZ * wall.nz);

  if (input.jump && state.climbing) {
    // Прыжок от стены: оттолкнуться и подлететь.
    state.climbing = false;
    state.wallNormal = undefined;
    v.x = wall.nx * PLAYER.wallJumpPush;
    v.z = wall.nz * PLAYER.wallJumpPush;
    v.y = PLAYER.wallJumpUp;
    return false;
  }
  const wantsClimb = push > (state.climbing ? CLIMB_RELEASE : CLIMB_START);
  const hold = state.climbing && push > -CLIMB_RELEASE;
  // С земли лезем, только если хотим вверх; стоя у стены и не толкая её — просто стоим.
  if (!wantsClimb && !hold) {
    state.climbing = false;
    state.wallNormal = undefined;
    return false;
  }

  state.climbing = true;
  state.grounded = false;
  state.wallNormal = { x: wall.nx, z: wall.nz };
  // Вбок вдоль стены — касательная составляющая джойстика; чуть «в стену» — чтобы не отлипнуть.
  const tx = -wall.nz;
  const tz = wall.nx;
  const side = input.dirX * tx + input.dirZ * tz;
  v.x = tx * side * PLAYER.climbSpeed - wall.nx * 0.5;
  v.z = tz * side * PLAYER.climbSpeed - wall.nz * 0.5;
  v.y = wantsClimb ? PLAYER.climbSpeed : 0;

  state.position.x += v.x * dt;
  state.position.z += v.z * dt;
  resolveHorizontal(state, colliders);
  const prevY = state.position.y;
  state.position.y += v.y * dt;
  resolveVertical(state, prevY, colliders);
  // resolveVertical мог поставить на пол (сполз до земли) — тогда уже не висим.
  if (state.grounded) {
    state.climbing = false;
    return true;
  }
  state.grounded = false;

  // Забраться наверх: руки достают до края — встаём на крышку, если там есть место.
  const top = wall.box.maxY;
  if (wantsClimb && state.position.y >= top - MANTLE_REACH) {
    const target = {
      x: state.position.x - wall.nx * (PLAYER.radius + 0.12),
      y: top,
      z: state.position.z - wall.nz * (PLAYER.radius + 0.12),
    };
    if (!penetratesColliders(target, colliders, EPS, height)) {
      state.position.x = target.x;
      state.position.y = target.y;
      state.position.z = target.z;
      v.x = v.y = v.z = 0;
      state.grounded = true;
      state.climbing = false;
      state.wallNormal = undefined;
    } else {
      // Наверху занято (на шкафу коробка, сверху потолок) — висим у края, а не срываемся вниз.
      state.position.y = Math.min(state.position.y, top - PLAYER.stepHeight - 0.01);
      v.y = 0;
    }
  }
  return true;
}

/** Голове или ступням можно чуть коснуться стены — так прижиматься к ней естественнее. */
const BODY_WALL_SLACK = 0.06;

/**
 * Лёжа тело длиннее цилиндра физики: голова и ноги торчат за его радиус вдоль направления взгляда.
 * Цилиндр не пускает в стену только середину тела, поэтому концы проверяем отдельно: голова ушла
 * в стену — отодвигаемся назад, ступни — вперёд. Длина тела берётся из хитбоксов позы,
 * то есть из той же модели, которую видят игроки.
 *
 * yaw нужен извне: направление взгляда знает клиент (физике оно не нужно для ходьбы).
 */
export function keepBodyOutOfWalls(state: PlayerPhysicsState, yaw: number, colliders: readonly Aabb[]): void {
  if (state.pose === 'none') return;
  let front = 0;
  let back = 0;
  for (const box of BODY_HITBOXES[stanceKey(state)]) {
    front = Math.max(front, box[5] - BODY_WALL_SLACK);
    back = Math.max(back, -box[2] - BODY_WALL_SLACK);
  }
  const p = state.position;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const top = p.y + bodyHeight(state);
  let moved = false;

  for (const [reach, sign] of [
    [front, 1],
    [back, -1],
  ] as const) {
    if (reach <= PLAYER.radius) continue;
    for (const b of colliders) {
      // Низкое (ковёр, ступенька) не мешает — на него тело просто ложится.
      if (b.maxY <= p.y + PLAYER.stepHeight || b.minY >= top) continue;
      const x = p.x + fx * reach * sign;
      const z = p.z + fz * reach * sign;
      if (x <= b.minX || x >= b.maxX || z <= b.minZ || z >= b.maxZ) continue;
      // Конец тела внутри блока: сколько пройти назад вдоль тела, чтобы выйти из него.
      const dx = -fx * sign;
      const dz = -fz * sign;
      const tx = dx > 1e-6 ? (b.maxX - x) / dx : dx < -1e-6 ? (b.minX - x) / dx : Infinity;
      const tz = dz > 1e-6 ? (b.maxZ - z) / dz : dz < -1e-6 ? (b.minZ - z) / dz : Infinity;
      const t = Math.min(tx, tz) + 0.01;
      p.x += dx * t;
      p.z += dz * t;
      moved = true;
    }
  }
  // Отодвинулись — середина тела могла упереться в другое препятствие.
  if (moved) resolveHorizontal(state, colliders);
}

/**
 * Смена позы. Принять позу можно только стоя на земле; поза «на месте» снимается движением или прыжком.
 * Если новая поза выше текущей (встать из «пластом»), над головой должно быть свободно — как с приседом.
 */
function updatePose(state: PlayerPhysicsState, input: MoveInput, colliders: readonly Aabb[]): void {
  let wanted: Pose = input.pose ?? 'none';
  if (wanted !== 'none' && (!state.grounded || cancelsPose(wanted, input))) wanted = 'none';
  if (wanted === state.pose) return;

  const nextHeight = bodyHeight({ crouching: state.crouching, pose: wanted });
  if (nextHeight > bodyHeight(state) && penetratesColliders(state.position, colliders, EPS, nextHeight)) return;
  state.pose = wanted;
  // В позу «на месте» замираем сразу, а не доезжаем по инерции.
  if (wanted !== 'none' && POSE_RULES[wanted].speed === 0) state.velocity.x = state.velocity.z = 0;
}

function resolveHorizontal(state: PlayerPhysicsState, colliders: readonly Aabb[]): void {
  const p = state.position;
  const v = state.velocity;
  const r = PLAYER.radius;

  for (const b of colliders) {
    const feet = p.y;
    const head = feet + bodyHeight(state);
    // Нет пересечения по высоте (блок над головой или мы стоим на нём) — не мешает.
    if (head <= b.minY || feet >= b.maxY - EPS) continue;

    // Ближайшая к центру цилиндра точка прямоугольника блока (вид сверху).
    const cx = clamp(p.x, b.minX, b.maxX);
    const cz = clamp(p.z, b.minZ, b.maxZ);
    let nx = p.x - cx;
    let nz = p.z - cz;
    const distSq = nx * nx + nz * nz;
    if (distSq >= r * r) continue;

    // Низкий блок — просто встаём на него.
    if (state.grounded && b.maxY - feet <= PLAYER.stepHeight) {
      p.y = b.maxY;
      continue;
    }

    const dist = Math.sqrt(distSq);
    if (dist > EPS) {
      nx /= dist;
      nz /= dist;
      p.x += nx * (r - dist);
      p.z += nz * (r - dist);
    } else {
      // Центр внутри блока: выталкиваем по оси с наименьшим проникновением.
      const left = p.x - b.minX;
      const right = b.maxX - p.x;
      const back = p.z - b.minZ;
      const front = b.maxZ - p.z;
      const m = Math.min(left, right, back, front);
      nx = 0;
      nz = 0;
      if (m === left) {
        p.x = b.minX - r;
        nx = -1;
      } else if (m === right) {
        p.x = b.maxX + r;
        nx = 1;
      } else if (m === back) {
        p.z = b.minZ - r;
        nz = -1;
      } else {
        p.z = b.maxZ + r;
        nz = 1;
      }
    }

    // Гасим скорость «в стену», оставляем вдоль неё — персонаж скользит по препятствию.
    const into = v.x * nx + v.z * nz;
    if (into < 0) {
      v.x -= nx * into;
      v.z -= nz * into;
    }
  }
}

function resolveVertical(state: PlayerPhysicsState, prevY: number, colliders: readonly Aabb[]): void {
  const p = state.position;
  const v = state.velocity;
  // Чуть меньший радиус — чтобы не «зацепиться» за верх стены, вдоль которой скользим.
  const r = PLAYER.radius * 0.95;
  const height = bodyHeight(state);
  state.grounded = false;

  if (p.y <= 0) {
    p.y = 0;
    if (v.y < 0) v.y = 0;
    state.grounded = true;
  }

  for (const b of colliders) {
    if (!circleOverlapsRect(p.x, p.z, r, b)) continue;

    if (v.y <= 0 && prevY >= b.maxY - EPS && p.y < b.maxY) {
      // Приземлились сверху. Проверяем prevY, а не только текущую позицию —
      // иначе при большой скорости падения можно «проскочить» тонкий блок.
      p.y = b.maxY;
      v.y = 0;
      state.grounded = true;
    } else if (v.y > 0 && prevY + height <= b.minY + EPS && p.y + height > b.minY) {
      // Ударились головой.
      p.y = b.minY - height;
      v.y = 0;
    }
  }
}

function circleOverlapsRect(x: number, z: number, r: number, b: Aabb): boolean {
  const dx = x - clamp(x, b.minX, b.maxX);
  const dz = z - clamp(z, b.minZ, b.maxZ);
  return dx * dx + dz * dz < r * r;
}

/**
 * Высота опоры под игроком: самый высокий блок под его кругом (вид сверху), не выше ног.
 * В отличие от groundHeightAt учитывает радиус — игрок, стоящий на краю ящика центром мимо него,
 * всё равно стоит на ящике.
 */
export function supportHeight(position: Vec3, colliders: readonly Aabb[]): number {
  const r = PLAYER.radius * 0.95;
  let ground = 0;
  for (const b of colliders) {
    if (b.maxY > position.y + 0.05 || b.maxY <= ground) continue;
    if (circleOverlapsRect(position.x, position.z, r, b)) ground = b.maxY;
  }
  return ground;
}

/** Высота прыжка с места: v² / 2g. Нужна серверу, чтобы ловить «полёты». */
export const JUMP_HEIGHT = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);

/** Высота опоры под точкой (для тени под персонажем): самый высокий блок не выше maxY. */
export function groundHeightAt(x: number, z: number, maxY: number, colliders: readonly Aabb[]): number {
  let ground = 0;
  for (const b of colliders) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (b.maxY <= maxY + EPS && b.maxY > ground) ground = b.maxY;
  }
  return ground;
}

/**
 * Стоит ли цилиндр игрока внутри какого-то блока глубже, чем на tolerance.
 * Нужна серверу: честная физика клиента никогда не заводит игрока в стену.
 */
export function penetratesColliders(
  position: Vec3,
  colliders: readonly Aabb[],
  tolerance: number,
  height: number = PLAYER.height,
): boolean {
  const r = PLAYER.radius - tolerance;
  const feet = position.y + tolerance;
  const head = position.y + height - tolerance;
  for (const b of colliders) {
    if (head <= b.minY || feet >= b.maxY) continue;
    if (circleOverlapsRect(position.x, position.z, r, b)) return true;
  }
  return false;
}
