/** Минимальный вектор без зависимостей. Shared-код не тянет three.js, его запускает и сервер. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function copyVec3(target: Vec3, source: Vec3): Vec3 {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  return target;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
