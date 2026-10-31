import { vec3, type Vec3 } from '../math.js';
import { perimeterWalls, scaleMap, type MapDef, type Shape } from './map.js';
import { PALETTE as P, assembly, block, box, place, type Passage } from './procedural.js';
import { PROP_BUILDERS } from './recipe-props/index.js';

/** Во сколько раз мир крупнее плана рецепта: персонаж 1.6 м — «игрушка» среди столов и домиков, как в квартире. */
export const RECIPE_SCALE = 3;

/** Отдельный блок рецепта (`y` — центр, как у всего генератора). */
export interface RecipeBlock {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  solid?: boolean;
  round?: number;
  shape?: Shape;
  noClimb?: boolean;
  glow?: boolean;
}

/** Готовый предмет из `PROP_BUILDERS`: центр основания в (x, z), поворот четвертями. */
export interface RecipeProp {
  kind: string;
  x: number;
  z: number;
  color?: string;
  turn?: number;
  variant?: number;
}

/**
 * Карта как данные: размер, ограда, предметы, блоки, точки появления и маршруты для теста.
 * Новая карта из готовых предметов — новый рецепт, без нового кода. Всё в метрах плана (до ×3).
 */
export interface MapRecipe {
  id: string;
  name: string;
  width: number;
  depth: number;
  floor: string;
  /** indoor — стены до потолка, hedge — живая изгородь, castle — крепостная стена с зубцами. */
  boundary: 'indoor' | 'hedge' | 'castle';
  props: RecipeProp[];
  blocks: RecipeBlock[];
  spawns: Vec3[];
  seekerSpawns: Vec3[];
  seekSeconds: number;
  /** Маршруты, которые обязаны оставаться проходимыми: тест проходит их нашей физикой. */
  routes: Passage[];
}

const WALL_HEIGHT = { indoor: 4.2, castle: 2.8, hedge: 1.7 } as const;
const WALL_COLOR = { indoor: P.cream, castle: P.stone, hedge: P.leaf } as const;
/** Высота невидимой ограды открытых карт (×3 — 30 м): выше любой крыши, наружу не перелезть. */
const FENCE_HEIGHT = 10;

/** Рецепт → карта игры (уже увеличенная ×3) и её проверочные маршруты в мировых координатах. */
export function compileRecipe(recipe: MapRecipe): { map: MapDef; passages: Passage[] } {
  const a = assembly();
  const hw = recipe.width / 2;
  const hd = recipe.depth / 2;
  const height = WALL_HEIGHT[recipe.boundary];
  const color = WALL_COLOR[recipe.boundary];
  for (const [x, z, w, d] of [
    [-hw + 0.15, 0, 0.3, recipe.depth],
    [hw - 0.15, 0, 0.3, recipe.depth],
    [0, -hd + 0.15, recipe.width - 0.6, 0.3],
    [0, hd - 0.15, recipe.width - 0.6, 0.3],
  ] as const) {
    box(a, x, height / 2, z, w, height, d, color, true, 0.035, true);
  }
  if (recipe.boundary === 'castle') {
    for (let x = -hw + 1; x < hw; x += 1.4) {
      for (const z of [-hd + 0.26, hd - 0.26]) box(a, x, 3.07, z, 0.72, 0.54, 0.48, P.ivory, true, 0.05);
    }
    for (let z = -hd + 1; z < hd; z += 1.4) {
      for (const x of [-hw + 0.26, hw - 0.26]) box(a, x, 3.07, z, 0.48, 0.54, 0.72, P.ivory, true, 0.05);
    }
  }
  for (const b of recipe.blocks) {
    const shape = b.shape ?? (b.round === 0 ? 'box' : 'rounded');
    const q = block(a, b.x, b.y, b.z, b.w, b.h, b.d, b.color, shape, b.round ?? 0.05, b.solid ?? false, b.noClimb ?? false);
    if (b.glow) q.glow = true;
  }
  for (const p of recipe.props) {
    const builder = PROP_BUILDERS[p.kind];
    if (!builder) throw new Error(`Нет предмета для рецепта: ${p.kind}`);
    place(a, builder(p.color, p.variant ?? 0), p.x, p.z, p.turn ?? 0);
  }

  const indoor = recipe.boundary === 'indoor';
  const plan: MapDef = {
    id: recipe.id,
    name: recipe.name,
    width: recipe.width,
    depth: recipe.depth,
    floorColor: recipe.floor,
    ...(indoor ? { skyColor: '#cfe8ff', ceiling: { height, color: P.ivory } } : {}),
    boxes: [
      ...a.boxes,
      // Помещение: потолок для физики (голова упирается при прыжке и лазании). Открытая карта —
      // невидимая ограда выше крыш: с дерева или домика через изгородь не перепрыгнуть.
      ...(indoor
        ? [{ x: 0, z: 0, y: height, w: recipe.width + 2, h: 1, d: recipe.depth + 2, color: '#000000', hidden: true }]
        : perimeterWalls(recipe.width, recipe.depth, FENCE_HEIGHT, '#000000').map((wall) => ({ ...wall, hidden: true }))),
    ],
    spawns: recipe.spawns,
    seekerSpawns: recipe.seekerSpawns,
    seekSeconds: recipe.seekSeconds,
  };
  const k = RECIPE_SCALE;
  const scaled = (p: Vec3) => vec3(p.x * k, p.y * k, p.z * k);
  return {
    map: scaleMap(plan, k),
    passages: [...recipe.routes, ...a.passages].map((p) => ({ id: p.id, from: scaled(p.from), to: scaled(p.to) })),
  };
}
