import { vec3, type Vec3 } from '../math.js';
import type { MapDef } from './map.js';
import { PALETTE as P, type Passage } from './procedural.js';
import { compileRecipe, type MapRecipe, type RecipeBlock, type RecipeProp } from './recipe.js';
import { SCHOOL_COLORS as S } from './recipe-props/school.js';

/** Помещения школы: центр и размер в метрах плана. Цвет — отделка пола у двери кабинета. */
const ZONES = [
  { key: 'classroom', center: [-14.5, -11], size: [11, 8] },
  { key: 'science', center: [-4.5, -11], size: [9, 8] },
  { key: 'art', center: [4.5, -11], size: [9, 8] },
  { key: 'library', center: [14.5, -11], size: [11, 8] },
  { key: 'computers', center: [-14.5, -2], size: [11, 4] },
  { key: 'music', center: [-14.5, 2], size: [11, 4] },
  { key: 'gym', center: [14.5, 0], size: [11, 8] },
  { key: 'canteen', center: [-13.5, 10], size: [13, 6] },
  { key: 'lobby', center: [0, 10], size: [14, 6] },
  { key: 'cloakroom', center: [13.5, 10], size: [13, 6] },
  { key: 'garden', center: [0, 0], size: [12, 8] },
] as const;

/**
 * Школа Mecha School (132 × 108 м после ×3) из коллекции генератора: одноэтажный корпус с крышей
 * и открытым внутренним двором. Класс, лаборатория, кабинет рисования, библиотека, компьютерный
 * и музыкальный кабинеты, спортзал, столовая, холл, гардероб; кольцевой коридор и проходы между
 * соседними кабинетами. Двери — открытые проёмы. Перед школой — площадка с деревьями.
 */
function recipe(): MapRecipe {
  const props: RecipeProp[] = [];
  const blocks: RecipeBlock[] = [];
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, solid = false, round = 0): RecipeBlock => {
    const b: RecipeBlock = { x, y, z, w, h, d, color, solid, round };
    blocks.push(b);
    return b;
  };
  const place = (kind: string, x: number, z: number, color?: string, turn = 0, variant = 0) => props.push({ kind, x, z, color, turn, variant });
  const floor = (x: number, z: number, w: number, d: number, color: string, y = 0.012) => add(x, y, z, w, 0.012, d, color);

  /**
   * Стена вдоль оси с дверными проёмами: нижняя часть (цвет отделки) и верхняя до крыши, над проёмом —
   * перемычка, по краям проёма — деревянные наличники. По стенам можно лезть до крыши, как по любым.
   */
  function wall(axis: 'x' | 'z', fixed: number, start: number, end: number, doors: number[] = [], color: string = S.wall, doorWidth = 2.0): void {
    const along = (c: number, y: number, len: number, h: number, thick: number, col: string, solid = false) =>
      axis === 'x' ? add(c, y, fixed, len, h, thick, col, solid) : add(fixed, y, c, thick, h, len, col, solid);
    const ranges: [number, number][] = [];
    let last = start;
    for (const c of [...doors].sort((p, q) => p - q)) {
      ranges.push([last, c - doorWidth / 2]);
      last = c + doorWidth / 2;
      along(c, 3.15, doorWidth, 1.3, 0.14, S.wall, true);
      for (const side of [-1, 1]) {
        const x = c + side * (doorWidth / 2 + 0.025);
        if (axis === 'x') add(x, 1.22, fixed, 0.07, 2.44, 0.19, S.wood);
        else add(fixed, 1.22, x, 0.19, 2.44, 0.07, S.wood);
      }
    }
    ranges.push([last, end]);
    for (const [lo, hi] of ranges) {
      if (hi - lo <= 0.001) continue;
      const mid = (lo + hi) / 2;
      const len = hi - lo;
      along(mid, 0.43, len, 0.86, 0.14, color, true);
      along(mid, 2.33, len, 2.94, 0.14, S.wall, true);
      // Плинтус с обеих сторон.
      for (const sign of [-1, 1]) {
        if (axis === 'x') add(mid, 0.11, fixed + sign * 0.076, len, 0.12, 0.014, S.linen);
        else add(fixed + sign * 0.076, 0.11, mid, 0.014, 0.12, len, S.linen);
      }
    }
  }

  // Наружные стены корпуса.
  wall('x', -15, -20, 20, [], S.ochre);
  wall('x', 13, -20, 20, [0], S.ochre, 4.0);
  wall('z', -20, -15, 13, [-3.5, 3.5], S.ochre);
  wall('z', 20, -15, 13, [0], S.ochre);
  // Четыре северных кабинета, соседние соединены дверями.
  for (const [x, color] of [
    [-9, S.ochre],
    [0, S.mint],
    [9, S.rose],
  ] as const) {
    wall('z', x, -15, -7, [-11], color);
  }
  wall('x', -7, -20, 20, [-16, -12, -4.5, 4.5, 12, 16], S.mint);
  wall('z', -9, -4, 4, [-2.2, 2.2], S.blue);
  wall('x', 0, -20, -9, [-14.5], S.blue);
  wall('z', 9, -4, 4, [-2.2, 2.2], S.ochre);
  for (const z of [-4, 4]) {
    wall('x', z, -20, -9, [-14.5], S.blue);
    wall('x', z, 9, 20, [14.5], S.ochre);
  }
  wall('x', 7, -20, 20, [-16, -11, 0, 11, 16], S.mint);
  wall('z', -7, 7, 13, [10], S.mint);
  wall('z', 7, 7, 13, [10], S.rose);
  // Внутренний двор: выходы на все четыре стороны коридора, тупиков нет.
  wall('x', -4, -6, 6, [0], S.mint);
  wall('x', 4, -6, 6, [0], S.mint);
  wall('z', -6, -4, 4, [0], S.mint);
  wall('z', 6, -4, 4, [0], S.mint);
  // Крыша — только над корпусом и коридорами; двор открыт небу.
  for (const [x, z, w, d] of [
    [0, -9.5, 40, 11],
    [0, 8.5, 40, 9],
    [-13, 0, 14, 8],
    [13, 0, 14, 8],
  ] as const) {
    add(x, 3.88, z, w, 0.16, d, S.wall, true);
    // Потолок снизу — ровный светлый, без освещения (glow), как в квартире: на нижнюю грань крыши
    // светит только слабый рассеянный свет снизу, и она выходила тёмно-бурой.
    add(x, 3.79, z, w, 0.008, d, '#f3f0e6').glow = true;
  }

  // Окна: стекло, рамы и широкие подоконники — обычная краска, пипетка её берёт.
  for (const x of [-18, -14, -10, -6, -2, 2, 6, 10, 14, 18]) {
    for (const z of [-15, 13]) {
      if (z === 13 && Math.abs(x) < 3) continue;
      for (const side of [-1, 1]) {
        add(x, 2, z + side * 0.084, 2.5, 1.55, 0.025, S.blue);
        add(x, 2, z + side * 0.102, 0.065, 1.55, 0.035, P.ivory);
        add(x, 2, z + side * 0.103, 2.5, 0.065, 0.035, P.ivory);
      }
      add(x, 1.18, z, 2.7, 0.1, 0.38, S.linen);
    }
  }
  for (const x of [-20, 20]) {
    for (const z of [-12, -8, 8, 11]) {
      for (const side of [-1, 1]) {
        add(x + side * 0.085, 2, z, 0.025, 1.55, 2.25, S.blue);
        add(x + side * 0.103, 2, z, 0.035, 1.55, 0.065, P.ivory);
      }
    }
  }

  // Пол кабинетов и коридоров: зоны различимы, но без радуги.
  for (const r of ZONES) {
    const [x, z] = r.center;
    const color = r.key === 'garden' ? '#91a873' : r.key === 'gym' ? S.wood : r.key === 'library' ? '#c9c1ab' : '#d9d5c8';
    floor(x, z, r.size[0] - 0.18, r.size[1] - 0.18, color);
  }
  for (const [x, z, w, d] of [
    [0, -5.5, 40, 3],
    [0, 5.5, 40, 3],
    [-7.5, 0, 3, 8],
    [7.5, 0, 3, 8],
  ] as const) {
    floor(x, z, w, d, '#c9c9bf');
  }
  // Швы плитки коридора, цветные полосы у дверей, паркет и разметка спортзала.
  for (let x = -19; x <= 19; x += 1.4) for (const z of [-5.5, 5.5]) floor(x, z, 0.018, 2.85, S.linen, 0.022);
  for (let z = -6; z <= 6; z += 1.2) for (const x of [-7.5, 7.5]) floor(x, z, 2.8, 0.018, S.linen, 0.022);
  for (const [x, c] of [
    [-15, S.ochre],
    [-4.5, S.mint],
    [4.5, S.rose],
    [15, S.violet],
  ] as const) {
    floor(x, -6.42, 4.8, 0.16, c, 0.03);
    floor(x, 6.42, 4.8, 0.16, c, 0.03);
  }
  for (const x of [-8.4, 8.4]) floor(x, 0, 0.16, 7, S.blue, 0.03);
  for (let z = -3.5; z < 4; z += 0.56) floor(14.5, z, 10.65, 0.012, '#b28d61', 0.025);
  for (const x of [10.15, 18.85]) floor(x, 0, 0.045, 6, P.ivory, 0.04);
  for (const z of [-3, 0, 3]) floor(14.5, z, 8.75, 0.045, P.ivory, 0.04);
  for (const x of [12.5, 16.5]) for (const z of [-2.3, 2.3]) floor(x, z, 0.045, 1.4, P.ivory, 0.04);

  // Класс: шесть парт со стульями, стол учителя, доска, шкаф, рюкзаки.
  for (const [row, z] of [-10.9, -8.7].entries()) {
    for (const [col, x] of [-17.5, -14.5, -11.5].entries()) {
      place('school-desk', x, z, S.wood, 0, row + col);
      place('school-seat', x, z + 1.0, S.blue);
    }
  }
  place('school-desk', -14.5, -13.2, S.wood, 2, 2);
  place('school-board', -14.5, -14.87, S.board);
  place('school-shelf', -18.5, -13.2, S.wood, 1);
  place('school-bag', -19, -9.5, S.rose);
  place('school-bag', -10, -9.5, S.blue);
  place('school-poster', -19.86, -11, S.ochre, 1, 0);
  place('school-clock', -10.8, -14.86);
  // Лаборатория: столы с мойками, доска, глобус, плакаты.
  for (const [i, x] of [-6.7, -2.4].entries()) for (const [j, z] of [-12.9, -9].entries()) place('school-lab', x, z, S.mint, 0, i + j);
  place('school-board', -4.5, -14.87, S.board, 0, 1);
  // Глобус в углу, а не у двери из класса: его стойка твёрдая, в проходе на неё бы залезали.
  place('school-globe', -8.2, -14.3);
  place('school-poster', -8.86, -13, S.mint, 1, 0);
  place('school-poster', -0.14, -8.4, S.blue, 3, 1);
  // Кабинет рисования: столы с красками, мольберты, сушилка, пятна краски на полу.
  for (const x of [2.25, 6.6]) for (const z of [-12.5, -9]) place('school-desk', x, z, S.wood, 0, 1);
  for (const [i, x] of [1.5, 4.5, 7.5].entries()) place('school-easel', x, -14.15, [S.rose, S.blue, S.violet][i], 0, i);
  place('school-shelf', 8.35, -11.7, P.ivory, 3, 2);
  place('school-poster', 0.14, -13, S.rose, 1, 3);
  for (const [i, x] of [1.8, 2.6, 3.4, 4.2, 5].entries()) floor(x, -8.1, 0.62, 0.5, [P.coral, P.blue, P.mint, P.yellow, P.purple][i]!, 0.038);
  // Библиотека: стеллажи (под ними проходят), кресла, стол библиотекаря, глобус.
  for (const [i, x] of [11, 14.5, 18].entries()) place('school-shelf', x, -12, S.wood, 1, i);
  for (const [i, x] of [10.7, 13.3, 16, 18.4].entries()) place('school-reading', x, -8.4, [S.rose, S.blue, S.mint, S.violet][i], 2);
  place('school-desk', 14.5, -14, S.wood, 2, 0);
  place('school-poster', 19.86, -9.5, S.violet, 3, 3);
  place('school-globe', 18.5, -14);
  // Компьютерный кабинет: три места, экраны — краска, а не свечение.
  for (const [i, x] of [-17.5, -14.5, -11.5].entries()) {
    place('school-computer', x, -2.8, [S.blue, S.mint, S.violet][i]);
    place('school-seat', x, -2.8 + 0.94, S.blue);
  }
  place('school-board', -14.5, -3.86, S.board, 0, 1);
  place('school-poster', -19.86, -3, S.blue, 1, 0);
  // Музыкальный кабинет: пианино, барабаны, стулья.
  place('school-piano', -18.8, 2, S.ink, 1);
  place('school-drums', -13, 2.5, S.rose);
  for (const x of [-16.7, -15]) place('school-seat', x, 1.2, S.mint, 1);
  place('school-poster', -19.86, 1.5, S.mint, 1, 2);
  place('school-poster', -9.14, 3.2, S.rose, 3, 2);
  place('school-shelf', -10.3, 2, S.wood, 1, 1);
  // Спортзал: два щита, стойка мячей, маты, скамейки.
  place('school-hoop', 14.5, -3.4);
  place('school-hoop', 14.5, 3.4, P.white, 2);
  place('school-sports', 18.6, -2.1, S.blue, 1, 1);
  place('school-mats', 18.7, 2.4, S.blue, 1);
  place('bench', 11.5, -2.8, S.wood);
  place('bench', 11.5, 2.8, S.wood);
  place('school-bag', 17.6, 0.6, S.rose);
  place('school-poster', 19.86, -0.7, S.ochre, 3, 1);
  // Столовая: столы со скамьями (под столешницей — проход), раздача, холодильник.
  for (const x of [-17.4, -11.5]) place('school-lunch', x, 9.5, S.wood);
  place('school-counter', -17, 12, S.mint);
  place('fridge', -9, 12.0, S.blue, 2);
  place('school-poster', -19.86, 9.5, S.rose, 1, 3);
  // Гардероб, холл, коридор.
  for (const [i, x] of [9.2, 13.5, 17.8].entries()) {
    place('school-lockers', x, 12.5, S.blue, 2, i === 1 ? 1 : 0);
    place('school-cubbies', x, 7.6, S.wood);
  }
  place('bench', 13.5, 10, S.wood);
  place('school-bag', 8.2, 9.4, S.rose);
  place('school-bag', 18.7, 9.6, S.mint);
  place('school-trophy', -5.5, 12.5, S.wood, 2);
  place('bench', 4.8, 11.8, S.wood, 2);
  place('school-board', -5.3, 7.14, S.blue, 0, 1);
  place('planter', 5.9, 8.2, S.linen);
  place('school-clock', 0, 12.84, undefined, 2);
  for (const side of [-1, 1]) {
    place('school-lockers', side * 6.42, -2.5, S.blue, side < 0 ? 3 : 1, 1);
    place('bench', side * 3.8, 5.5, S.wood);
    place('planter', side * 3.8, 9.6, S.linen);
  }
  place('school-janitor', -17.4, 3.4, S.ochre);
  // Двор: дорожки крестом, деревья, клумбы, скамейки, мозаика.
  floor(0, 0, 11.7, 1.8, '#c7c3b2', 0.025);
  floor(0, 0, 1.8, 7.7, '#c7c3b2', 0.026);
  for (const side of [-1, 1]) {
    place('tree', side * 3.65, -2.35, P.leaf, 0, 1);
    place('planter', side * 4.3, 2.7, S.linen);
    place('bench', side * 3.2, 0.1, S.wood, side < 0 ? 1 : 3);
  }
  for (const [i, x] of [-4.6, -3.6, -2.6, -1.6].entries()) floor(x, 3.3, 0.75, 0.6, [S.blue, S.rose, S.mint, S.ochre][i]!, 0.038);
  // Площадка перед школой.
  floor(0, 15.4, 7.5, 4.3, '#c6c3b7');
  for (const x of [-13, -7, 7, 13]) {
    place('tree', x, 16.0, P.leaf, 0, 0);
    place('bench', x, 14.3, S.wood);
  }
  place('school-sign', 0, 13.1, S.blue, 0, 0);
  for (const x of [-17, -12, -7, -2, 3, 8, 13, 18]) place('school-radiator', x, -14.7);
  for (const [x, z, c] of [
    [-16, -9.8, S.rose],
    [4.5, -11, S.rose],
    [12.3, -9.7, S.violet],
    [-18.7, -1.0, S.blue],
    [-3.5, 8.1, S.mint],
  ] as const) {
    place('school-notes', x, z, c);
  }
  // Таблички над дверями — на своей стороне стены, проём не загораживают.
  for (const [x, z, turn, variant, c] of [
    [-16, -6.9, 0, 1, S.ochre],
    [-4.5, -6.9, 0, 2, S.mint],
    [4.5, -6.9, 0, 3, S.rose],
    [16, -6.9, 0, 4, S.violet],
    [-8.9, -2.2, 1, 5, S.blue],
    [-8.9, 2.2, 1, 6, S.mint],
    [8.9, 2.2, 3, 7, S.ochre],
    [-11, 6.9, 2, 8, S.mint],
    [11, 6.9, 2, 9, S.rose],
  ] as const) {
    place('school-sign', x, z, c, turn, variant);
  }
  for (const [x, z, c, turn] of [
    [-19.86, -8, S.ochre, 1],
    [-8.86, -8, S.mint, 1],
    [8.86, -14, S.rose, 3],
    [19.86, -13, S.violet, 3],
    [-19.86, 5.7, S.blue, 1],
  ] as const) {
    place('school-poster', x, z, c, turn, 3);
  }
  // Светильники под крышей (светятся сами) и потёртости пола под ними.
  for (const r of ZONES) {
    if (r.key === 'garden') continue;
    const [x, z] = r.center;
    add(x, 3.76, z, 2.2, 0.035, 0.55, P.ivory).glow = true;
    add(x, 3.79, z, 2.35, 0.04, 0.68, S.metal);
    for (const dx of [-0.34, 0.34]) floor(x + dx, z + 0.62, 0.3, 0.045, S.linen, 0.028);
  }

  const route = (id: string, from: Vec3, to: Vec3): Passage => ({ id, from, to });
  return {
    id: 'school',
    name: 'Школа',
    width: 44,
    depth: 36,
    floor: '#b2b7a0',
    boundary: 'hedge',
    props,
    blocks,
    spawns: [vec3(-17.5, 0, -12), vec3(-4.5, 0, -11), vec3(4.5, 0, -9.8), vec3(16, 0, -13.5), vec3(-14.5, 0, -1), vec3(-14.5, 0, 3), vec3(14.5, 0, 0), vec3(0, 0, 10)],
    // Ищущие ждут на площадке перед входом.
    seekerSpawns: [vec3(-1.5, 0, 16), vec3(1.5, 0, 16)],
    seekSeconds: 300,
    routes: [
      route('north-corridor', vec3(-18, 0, -5.5), vec3(18, 0, -5.5)),
      route('south-corridor', vec3(-18, 0, 5.5), vec3(18, 0, 5.5)),
      route('west-corridor', vec3(-7.5, 0, -5.5), vec3(-7.5, 0, 5.5)),
      route('east-corridor', vec3(7.5, 0, -5.5), vec3(7.5, 0, 5.5)),
      route('garden-cross', vec3(-7.5, 0, 0), vec3(7.5, 0, 0)),
      route('garden-spine', vec3(0, 0, -5.5), vec3(0, 0, 5.5)),
      route('front-entry', vec3(0, 0, 16.5), vec3(0, 0, 5.5)),
      route('north-class-crosslink', vec3(-10, 0, -11), vec3(-8, 0, -11)),
      route('north-lab-art-crosslink', vec3(-1, 0, -11), vec3(1, 0, -11)),
      route('north-art-library-crosslink', vec3(8, 0, -11), vec3(10, 0, -11)),
      route('it-music-crosslink', vec3(-14.5, 0, -0.8), vec3(-14.5, 0, 0.8)),
      route('hall-canteen-crosslink', vec3(-8, 0, 10), vec3(-6, 0, 10)),
      route('hall-cloakroom-crosslink', vec3(6, 0, 10), vec3(8, 0, 10)),
    ],
  };
}

const compiled = compileRecipe(recipe());

export const SCHOOL: MapDef = compiled.map;
/** Проверочные маршруты коридоров и проходы под партами, стеллажами и столами — в мировых координатах. */
export const SCHOOL_PASSAGES: Passage[] = compiled.passages;
