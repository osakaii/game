import { clamp, type Vec3 } from './math.js';
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
} as const;

export function playerHeight(crouching: boolean): number {
  return crouching ? PLAYER.crouchHeight : PLAYER.height;
}

export interface PlayerPhysicsState {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  crouching: boolean;
}

/** Желаемое направление в мировых координатах (длина 0..1), прыжок и желание присесть. */
export interface MoveInput {
  dirX: number;
  dirZ: number;
  jump: boolean;
  crouch: boolean;
}

const EPS = 1e-4;

/** Один шаг симуляции. Мутирует state — без новых объектов на каждый тик (меньше работы GC на телефоне). */
export function stepPlayer(state: PlayerPhysicsState, input: MoveInput, colliders: readonly Aabb[], dt: number): void {
  const v = state.velocity;

  // 0. Присед. Встать можно, только если над головой свободно — иначе под столом
  //    персонаж «вырос» бы сквозь столешницу.
  if (input.crouch) {
    state.crouching = true;
  } else if (state.crouching && !penetratesColliders(state.position, colliders, EPS, PLAYER.height)) {
    state.crouching = false;
  }
  const speed = state.crouching ? PLAYER.crouchSpeed : PLAYER.walkSpeed;

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

  // 2. Прыжок (не из приседа) и гравитация.
  if (input.jump && state.grounded && !state.crouching) {
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

function resolveHorizontal(state: PlayerPhysicsState, colliders: readonly Aabb[]): void {
  const p = state.position;
  const v = state.velocity;
  const r = PLAYER.radius;

  for (const b of colliders) {
    const feet = p.y;
    const head = feet + playerHeight(state.crouching);
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
  const height = playerHeight(state.crouching);
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
