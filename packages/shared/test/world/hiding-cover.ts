import { PLAYER, penetratesColliders } from '../../src/physics.js';
import { BODY_HITBOXES } from '../../src/pose-hitboxes.js';
import { POSES, POSE_RULES, type StanceKey } from '../../src/poses.js';
import { buildColliders, mapBoxes, type Aabb, type MapBox, type MapDef } from '../../src/world/map.js';

/**
 * Сколько тела может быть внутри декорации (solid: false — сквозь неё проходят: вода, шторы, листва).
 * Сверх этого ищущий не видит игрока вовсе — нечестно: прятаться нужно краской, а не «в текстурах».
 */
export const MAX_COVER = 0.25;

/** Шаг сетки точек, где может стоять игрок, м. Мельче тела: щель между декорациями не проскочит. */
const STEP = 0.25;
const STANCES: readonly StanceKey[] = ['stand', 'crouch', ...POSES];
const YAWS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
/** Точек на ребро коробки части тела: 3³ = 27 на коробку, ~380 на тело. */
const SAMPLES = 3;

const STANCE_HEIGHT: Record<StanceKey, number> = {
  stand: PLAYER.height,
  crouch: PLAYER.crouchHeight,
  ...Object.fromEntries(POSES.map((pose) => [pose, POSE_RULES[pose].height])),
} as Record<StanceKey, number>;

interface Sample {
  x: number;
  y: number;
  z: number;
  weight: number;
}

/** Точки тела в мире (без сдвига) для позы и поворота; вес — доля объёма тела. Как модель: мир = Ry(yaw) · локальное. */
function bodySamples(stance: StanceKey, yaw: number): Sample[] {
  const boxes = BODY_HITBOXES[stance];
  const volume = boxes.reduce((sum, b) => sum + (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), 0);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const samples: Sample[] = [];
  for (const b of boxes) {
    const weight = ((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2])) / volume / SAMPLES ** 3;
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < SAMPLES; j++) {
        for (let k = 0; k < SAMPLES; k++) {
          const lx = b[0] + ((i + 0.5) / SAMPLES) * (b[3] - b[0]);
          const ly = b[1] + ((j + 0.5) / SAMPLES) * (b[4] - b[1]);
          const lz = b[2] + ((k + 0.5) / SAMPLES) * (b[5] - b[2]);
          samples.push({ x: lx * cos + lz * sin, y: ly, z: -lx * sin + lz * cos, weight });
        }
      }
    }
  }
  return samples;
}

/** Точка внутри формы блока: коробка, вертикальный овальный цилиндр или эллипсоид (как рисует клиент). */
function inside(b: MapBox, x: number, y: number, z: number): boolean {
  const bottom = b.y ?? 0;
  if (y < bottom || y > bottom + b.h) return false;
  const dx = (x - b.x) / (b.w / 2);
  const dz = (z - b.z) / (b.d / 2);
  if (b.shape === 'cylinder') return dx * dx + dz * dz <= 1;
  if (b.shape === 'sphere') {
    const dy = (y - bottom - b.h / 2) / (b.h / 2);
    return dx * dx + dy * dy + dz * dz <= 1;
  }
  return Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
}

function insideSolid(colliders: readonly Aabb[], x: number, y: number, z: number): boolean {
  return colliders.some((c) => c.minX <= x && x <= c.maxX && c.minY <= y && y <= c.maxY && c.minZ <= z && z <= c.maxZ);
}

export interface CoverSpot {
  /** Доля объёма тела внутри декорации. */
  cover: number;
  x: number;
  y: number;
  z: number;
  stance: StanceKey;
  /** Декорация, которая закрывает больше всего тела, — её и чинить. */
  culprit: MapBox;
}

/**
 * Все места карты, где тело уходит в декорацию больше чем на MAX_COVER. Проверяем каждую точку сетки,
 * на полу и на каждой опоре (можно залезть), во всех позах и восьми поворотах — куда игрок может встать,
 * не застряв в твёрдом (цилиндр тела позы не пересекает коллайдеры). Достижимость не проверяем:
 * закрытое место, куда никто не попадёт, починить проще, чем доказать, что туда не попасть.
 * Возвращает худшее место для каждой виноватой декорации.
 */
export function coverSpots(map: MapDef, limit = MAX_COVER): CoverSpot[] {
  const colliders = buildColliders(map);
  const decor = mapBoxes(map).filter((b) => b.solid === false && !b.hidden && Math.min(b.w, b.h, b.d) >= 0.04);
  // Сетки 1 м: декорацию и коллайдеры у точки берём из соседних клеток, а не перебором всей карты.
  const decorCells = buckets(decor.map((b) => [b, b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2] as const));
  const colliderCells = buckets(colliders.map((c) => [c, c.minX, c.maxX, c.minZ, c.maxZ] as const));
  const bodies = STANCES.flatMap((stance) =>
    YAWS.map((yaw) => {
      const samples = bodySamples(stance, yaw);
      // Габарит тела: декорация мимо него не может закрыть ни точки — отсеиваем до перебора точек.
      const xs = samples.map((s) => s.x);
      const zs = samples.map((s) => s.z);
      const box = { minX: Math.min(...xs) - 0.1, maxX: Math.max(...xs) + 0.1, minZ: Math.min(...zs) - 0.1, maxZ: Math.max(...zs) + 0.1 };
      return { stance, samples, box, top: Math.max(...samples.map((s) => s.y)) + 0.1 };
    }),
  );
  const reach = 1.1; // лёжа тело уходит от точки опоры до ~1 м
  const worst = new Map<MapBox, CoverSpot>();

  for (let x = -map.width / 2 + STEP / 2; x < map.width / 2; x += STEP) {
    for (let z = -map.depth / 2 + STEP / 2; z < map.depth / 2; z += STEP) {
      const near = around(decorCells, x, z, reach);
      if (near.length === 0) continue;
      const nearColliders = around(colliderCells, x, z, reach);
      // Опоры: пол и верх каждого твёрдого блока под точкой.
      const supports = new Set([0]);
      for (const c of nearColliders) {
        if (c.minX <= x && x <= c.maxX && c.minZ <= z && z <= c.maxZ) supports.add(c.maxY);
      }
      for (const y of supports) {
        const top = y + PLAYER.height;
        const local = near.filter((b) => (b.y ?? 0) < top && (b.y ?? 0) + b.h > y);
        if (local.length === 0) continue;
        const fits = new Map<StanceKey, boolean>();
        for (const { stance, samples, box, top: bodyTop } of bodies) {
          const touching = local.filter(
            (b) =>
              b.x + b.w / 2 > x + box.minX &&
              b.x - b.w / 2 < x + box.maxX &&
              b.z + b.d / 2 > z + box.minZ &&
              b.z - b.d / 2 < z + box.maxZ &&
              (b.y ?? 0) < y + bodyTop,
          );
          if (touching.length === 0) continue;
          if (!fits.has(stance)) fits.set(stance, !penetratesColliders({ x, y, z }, nearColliders, 0.02, STANCE_HEIGHT[stance]));
          if (!fits.get(stance)) continue;
          let cover = 0;
          let open = 0;
          const by = new Map<MapBox, number>();
          for (const s of samples) {
            const px = x + s.x;
            const py = y + s.y;
            const pz = z + s.z;
            // Часть тела в твёрдом — не «в текстуре»: из стены тело выталкивает keepBodyOutOfWalls.
            const hit = touching.find((b) => inside(b, px, py, pz));
            if (!hit || insideSolid(nearColliders, px, py, pz)) {
              // Открытой части тела уже больше 1 − limit — превысить предел это положение не может.
              open += s.weight;
              if (open > 1 - limit) break;
              continue;
            }
            cover += s.weight;
            by.set(hit, (by.get(hit) ?? 0) + s.weight);
          }
          if (cover <= limit) continue;
          const culprit = [...by].sort((a, b) => b[1] - a[1])[0]![0];
          const prev = worst.get(culprit);
          if (!prev || cover > prev.cover) worst.set(culprit, { cover, x, y, z, stance, culprit });
        }
      }
    }
  }
  return [...worst.values()].sort((a, b) => b.cover - a.cover);
}

/** Клетка 1 м → что в неё попадает. */
function buckets<T>(items: readonly (readonly [T, number, number, number, number])[]): Map<number, T[]> {
  const cells = new Map<number, T[]>();
  for (const [item, minX, maxX, minZ, maxZ] of items) {
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
        const k = cellKey(x, z);
        const list = cells.get(k);
        if (list) list.push(item);
        else cells.set(k, [item]);
      }
    }
  }
  return cells;
}

const cellKey = (x: number, z: number) => (x + 1000) * 4096 + (z + 1000);

/** Всё из клеток в радиусе от точки, без повторов. */
function around<T>(cells: Map<number, T[]>, x: number, z: number, radius: number): T[] {
  const found = new Set<T>();
  for (let cx = Math.floor(x - radius); cx <= Math.floor(x + radius); cx++) {
    for (let cz = Math.floor(z - radius); cz <= Math.floor(z + radius); cz++) {
      for (const item of cells.get(cellKey(cx, cz)) ?? []) found.add(item);
    }
  }
  return [...found];
}

export function describeSpot(s: CoverSpot): string {
  const b = s.culprit;
  return `${Math.round(s.cover * 100)}% (${s.stance}) в (${s.x.toFixed(1)}, ${s.y.toFixed(2)}, ${s.z.toFixed(1)}) — ${b.color} ${b.shape ?? 'box'} ${b.w.toFixed(2)}×${b.h.toFixed(2)}×${b.d.toFixed(2)} @ (${b.x.toFixed(1)}, ${(b.y ?? 0).toFixed(2)}, ${b.z.toFixed(1)})`;
}
