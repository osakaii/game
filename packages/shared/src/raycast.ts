import type { Vec3 } from './math.js';
import { PLAYER, playerHeight } from './physics.js';
import type { Aabb } from './world/map.js';

/**
 * Пересечение луча с AABB — slab-метод.
 *
 * Коробка = пересечение трёх «слоёв» (slab) между парами параллельных плоскостей: x∈[minX,maxX] и т.д.
 * Для каждой оси считаем, на каком t луч входит в слой и выходит из него.
 * Луч внутри коробки там, где он внутри ВСЕХ трёх слоёв: t от max(входов) до min(выходов).
 * Если max(входов) > min(выходов) — промах.
 *
 * Луч: point(t) = origin + dir * t, t >= 0. Возвращает t первого касания или null.
 */
export function rayAabb(origin: Vec3, dir: Vec3, box: Aabb, maxT: number): number | null {
  let tMin = 0;
  let tMax = maxT;

  for (const axis of AXES) {
    const o = origin[axis];
    const d = dir[axis];
    const min = axis === 'x' ? box.minX : axis === 'y' ? box.minY : box.minZ;
    const max = axis === 'x' ? box.maxX : axis === 'y' ? box.maxY : box.maxZ;

    if (Math.abs(d) < 1e-9) {
      // Луч параллелен слою: либо всегда внутри него, либо никогда.
      if (o < min || o > max) return null;
      continue;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

const AXES = ['x', 'y', 'z'] as const;

/**
 * Коробка игрока для попаданий. Чуть шире модели: ищущий видит прячущегося
 * с задержкой интерполяции, а палец на телефоне — не снайперский прицел.
 */
export function playerHitbox(position: Vec3, crouching = false, inflate = 0.08): Aabb {
  const r = PLAYER.radius + inflate;
  return {
    minX: position.x - r,
    maxX: position.x + r,
    minY: position.y,
    maxY: position.y + playerHeight(crouching) + inflate,
    minZ: position.z - r,
    maxZ: position.z + r,
  };
}
