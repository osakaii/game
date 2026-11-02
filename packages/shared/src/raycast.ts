import type { Vec3 } from './math.js';
import type { BodyStance } from './physics.js';
import { BODY_HITBOXES } from './pose-hitboxes.js';
import { stanceKey } from './poses.js';
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
 * Сколько от origin до ближайшей твёрдой поверхности мира по лучу dir (единичному): коробки
 * столкновений и пол (y = 0). Ничего ближе maxT — вернёт maxT.
 *
 * Для камеры, которая каждый кадр ищет стену между игроком и собой. Луч по склеенным мешам карты
 * проверяет все треугольники подряд (у школы — 90 тыс., ~2.6 мс на кадр на компьютере, на телефоне
 * в разы дольше), а по коробкам — тысяча коротких проверок. Коробка, внутри которой луч начинается,
 * не считается: как у меша, видимого только снаружи, — иначе камера прилипала бы к спине.
 */
export function rayToWorld(origin: Vec3, dir: Vec3, colliders: readonly Aabb[], maxT: number): number {
  let best = maxT;
  if (dir.y < -1e-9 && origin.y > 0) best = Math.min(best, -origin.y / dir.y);
  const ix = 1 / dir.x;
  const iy = 1 / dir.y;
  const iz = 1 / dir.z;
  for (const b of colliders) {
    if (
      origin.x > b.minX && origin.x < b.maxX &&
      origin.y > b.minY && origin.y < b.maxY &&
      origin.z > b.minZ && origin.z < b.maxZ
    ) {
      continue;
    }
    // Slab-метод через обратные компоненты: деление на 0 даёт ±Infinity, и сравнения остаются верными.
    let t1 = (b.minX - origin.x) * ix;
    let t2 = (b.maxX - origin.x) * ix;
    let near = Math.min(t1, t2);
    let far = Math.max(t1, t2);
    t1 = (b.minY - origin.y) * iy;
    t2 = (b.maxY - origin.y) * iy;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    t1 = (b.minZ - origin.z) * iz;
    t2 = (b.maxZ - origin.z) * iz;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near <= far && far > 0 && near >= 0 && near < best) best = near;
  }
  return best;
}

/**
 * Запас вокруг каждой части тела (м). Ищущий видит прячущегося с задержкой интерполяции,
 * тело чуть шевелится (дыхание, шаг), а палец на телефоне — не снайперский прицел.
 */
export const HIT_INFLATE = 0.07;

/**
 * Попал ли луч в игрока — по коробкам частей тела его текущей позы (BODY_HITBOXES).
 *
 * Коробки заданы в системе игрока, а игрок повёрнут на yaw. Вместо того чтобы поворачивать
 * 14 коробок (повёрнутая коробка уже не AABB, slab-метод для неё не работает), поворачиваем
 * один луч в обратную сторону — в систему игрока. Поворот не меняет длин, поэтому t общий.
 *
 * Возвращает t первого касания или null.
 */
export function rayHitsBody(
  origin: Vec3,
  dir: Vec3,
  position: Vec3,
  yaw: number,
  stance: BodyStance,
  maxT: number,
  inflate = HIT_INFLATE,
): number | null {
  // Модель повёрнута как three.js rotation.y: мир = Ry(yaw) · локальное. Обратно — Ry(-yaw).
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const ox = origin.x - position.x;
  const oz = origin.z - position.z;
  const localOrigin = { x: cos * ox - sin * oz, y: origin.y - position.y, z: sin * ox + cos * oz };
  const localDir = { x: cos * dir.x - sin * dir.z, y: dir.y, z: sin * dir.x + cos * dir.z };

  let best: number | null = null;
  for (const [minX, minY, minZ, maxX, maxY, maxZ] of BODY_HITBOXES[stanceKey(stance)]) {
    const box = {
      minX: minX - inflate,
      minY: minY - inflate,
      minZ: minZ - inflate,
      maxX: maxX + inflate,
      maxY: maxY + inflate,
      maxZ: maxZ + inflate,
    };
    const t = rayAabb(localOrigin, localDir, box, best ?? maxT);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * Нормаль поверхности в точке попадания: на какой грани какого блока лежит точка.
 * Нужна, чтобы положить пятно краски «плашмя» на стену, а не воткнуть его поперёк.
 */
export function surfaceNormalAt(point: Vec3, colliders: readonly Aabb[], eps = 0.02): Vec3 {
  let best: Vec3 = { x: 0, y: 1, z: 0 }; // по умолчанию — пол
  let bestDistance = Math.abs(point.y);

  for (const b of colliders) {
    // Точка должна лежать на поверхности блока (внутри него с небольшим допуском).
    if (
      point.x < b.minX - eps || point.x > b.maxX + eps ||
      point.y < b.minY - eps || point.y > b.maxY + eps ||
      point.z < b.minZ - eps || point.z > b.maxZ + eps
    ) {
      continue;
    }
    const faces: [number, Vec3][] = [
      [Math.abs(point.x - b.minX), { x: -1, y: 0, z: 0 }],
      [Math.abs(point.x - b.maxX), { x: 1, y: 0, z: 0 }],
      [Math.abs(point.y - b.minY), { x: 0, y: -1, z: 0 }],
      [Math.abs(point.y - b.maxY), { x: 0, y: 1, z: 0 }],
      [Math.abs(point.z - b.minZ), { x: 0, y: 0, z: -1 }],
      [Math.abs(point.z - b.maxZ), { x: 0, y: 0, z: 1 }],
    ];
    for (const [distance, normal] of faces) {
      if (distance < bestDistance) {
        bestDistance = distance;
        best = normal;
      }
    }
  }
  return best;
}
