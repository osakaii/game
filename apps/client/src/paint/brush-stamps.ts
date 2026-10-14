/**
 * Мазок = цепочка «оттисков» кисти. Палец за кадр может пролететь несколько сантиметров —
 * если ставить оттиск только в точке события, мазок станет пунктиром. Поэтому между
 * предыдущим и новым положением добавляем оттиски с шагом в долю радиуса.
 */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Доля радиуса между оттисками: меньше — ровнее край мазка, больше — меньше работы видеокарте. */
export const STAMP_SPACING = 0.3;

/**
 * Точки оттисков на отрезке (from, to], с шагом spacing.
 * Возвращает и «остаток» — сколько пути уже пройдено после последнего оттиска,
 * чтобы шаг между кадрами оставался ровным при медленном движении пальца.
 */
export function interpolateStamps(
  from: Point3,
  to: Point3,
  spacing: number,
  carried: number,
): { points: Point3[]; carried: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  const points: Point3[] = [];
  if (spacing <= 0 || length === 0) return { points, carried };

  let distance = spacing - carried;
  while (distance <= length) {
    const t = distance / length;
    points.push({ x: from.x + dx * t, y: from.y + dy * t, z: from.z + dz * t });
    distance += spacing;
  }
  return { points, carried: length - (distance - spacing) };
}
