import { playerHitbox, rayAabb, type Aabb, type Vec3 } from '@mecha/shared';

export interface ShotTarget {
  id: string;
  position: Vec3;
  /** Присевший ниже — и попасть в него труднее. */
  crouching?: boolean;
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
    const t = rayAabb(origin, dir, playerHitbox(target.position, target.crouching), maxT);
    if (t !== null && (!best || t < best.t)) best = { t, playerId: target.id };
  }
  return best;
}
