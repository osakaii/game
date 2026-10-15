import type { PartSize, Point3 } from './character-parts';

/**
 * Скруглённая коробка = внутренняя коробка, «обёрнутая» слоем толщиной radius
 * (математически — сумма Минковского коробки и шара).
 *
 * Как получить её поверхность из обычной коробки: берём точку на плоской грани, находим ближайшую
 * точку внутренней коробки q и откладываем от q расстояние radius в сторону исходной точки.
 * В середине грани точка не сдвигается, у рёбер — «скатывается» на скругление. Нормаль — это
 * направление от q к точке.
 *
 * Главное: каждая точка плоской грани переходит в одну точку скруглённой поверхности.
 * Поэтому выкройка (атлас) остаётся прежней — меняется только то, где на теле лежит тексель.
 */
export interface Caps {
  /** Верхний торец плоский (не скруглён) — к нему вплотную примыкает соседний сегмент конечности. */
  flatTop?: boolean;
  flatBottom?: boolean;
}

/**
 * endFace — точка лежит на верхней или нижней грани коробки (а не на боковой). Точку на ребре можно
 * отнести к обеим граням, поэтому вызывающий говорит явно, с какой грани она пришла.
 */
export function roundBoxPoint(
  flat: Point3,
  size: PartSize,
  radius: number,
  caps: Caps = {},
  endFace = false,
): { point: Point3; normal: Point3 } {
  const ix = Math.max(0, size.w / 2 - radius);
  const iz = Math.max(0, size.d / 2 - radius);
  const onFlatEnd = endFace && ((caps.flatTop && flat.y > 0) || (caps.flatBottom && flat.y < 0));
  if (onFlatEnd) {
    // Плоский торец остаётся в своей плоскости; только углы квадрата стягиваются на дугу скругления —
    // торец принимает форму сечения трубки (скруглённый квадрат).
    const cx = clamp(flat.x, -ix, ix);
    const cz = clamp(flat.z, -iz, iz);
    const dx = flat.x - cx;
    const dz = flat.z - cz;
    const length = Math.hypot(dx, dz);
    const k = length > radius ? radius / length : 1;
    return { point: { x: cx + dx * k, y: flat.y, z: cz + dz * k }, normal: { x: 0, y: Math.sign(flat.y), z: 0 } };
  }
  // У плоского торца внутренняя коробка доходит до самого торца: скругляются только боковые рёбра,
  // и сечение у торца — то же, что посередине. Два таких сегмента стыкуются без «перетяжки».
  const iyTop = Math.max(0, size.h / 2 - (caps.flatTop ? 0 : radius));
  const iyBottom = -Math.max(0, size.h / 2 - (caps.flatBottom ? 0 : radius));
  const qx = clamp(flat.x, -ix, ix);
  const qy = clamp(flat.y, iyBottom, iyTop);
  const qz = clamp(flat.z, -iz, iz);
  const dx = flat.x - qx;
  const dy = flat.y - qy;
  const dz = flat.z - qz;
  // Точка на поверхности коробки всегда отстоит от внутренней хотя бы на radius по оси своей грани.
  const length = Math.hypot(dx, dy, dz) || 1;
  const normal = { x: dx / length, y: dy / length, z: dz / length };
  return {
    point: { x: qx + normal.x * radius, y: qy + normal.y * radius, z: qz + normal.z * radius },
    normal,
  };
}

/**
 * Где на грани длиной length ставить вершины сетки (доли 0..1).
 * Скругление занимает полосу radius у каждого края — там нужны частые вершины, иначе дуга
 * станет ломаной. Плоская середина — одна-две клетки: треугольников меньше, а форма та же.
 */
export function gridSteps(length: number, radius: number, bandSteps = 3): number[] {
  const band = Math.min(0.5, radius / length);
  const steps: number[] = [];
  for (let k = 0; k <= bandSteps; k++) steps.push((band * k) / bandSteps);
  // Середина тоже делится: на длинной грани (торс) свет по ней лучше интерполируется.
  if (1 - 2 * band > 0.3) steps.push(0.5);
  for (let k = bandSteps; k >= 0; k--) steps.push(1 - (band * k) / bandSteps);
  // Если скругление «съело» всю грань, полосы встречаются в середине — убираем совпадающие точки.
  return steps.filter((t, i) => i === 0 || t - steps[i - 1] > 1e-6);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
