import { rayAabb, rayHitsBody, type Aabb, type Pose, type Vec3 } from '@mecha/shared';

export interface ShotTarget {
  id: string;
  position: Vec3;
  /** Куда смотрит (рад): лежащий вдоль стены и поперёк неё — разные коробки в мире. */
  yaw?: number;
  /** Присед и поза задают форму тела — по ней и считается попадание. */
  crouching?: boolean;
  pose?: Pose;
}

export interface ShotHit {
  t: number;
  /** null — попали в стену или пол. */
  playerId: string | null;
}

/**
 * Ближайшее пересечение луча со сценой: пол, блоки карты, прячущиеся.
 * Берём минимальный t: если стена ближе игрока, игрок за ней и попадание не засчитано.
 * Это и есть защита от «стрельбы сквозь стены».
 */
export function resolveShot(
  origin: Vec3,
  dir: Vec3,
  colliders: readonly Aabb[],
  targets: readonly ShotTarget[],
  maxT: number,
): ShotHit | null {
  let best: ShotHit | null = null;

  // Пол — плоскость y = 0. Пересечение: origin.y + dir.y * t = 0.
  if (dir.y < -1e-9) {
    const t = -origin.y / dir.y;
    if (t <= maxT) best = { t, playerId: null };
  }
  for (const box of colliders) {
    const t = rayAabb(origin, dir, box, maxT);
    if (t !== null && (!best || t < best.t)) best = { t, playerId: null };
  }
  for (const target of targets) {
    const stance = { crouching: !!target.crouching, pose: target.pose };
    const t = rayHitsBody(origin, dir, target.position, target.yaw ?? 0, stance, maxT);
    if (t !== null && (!best || t < best.t)) best = { t, playerId: target.id };
  }
  return best;
}
