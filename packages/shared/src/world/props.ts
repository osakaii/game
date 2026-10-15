import type { MapBox } from './map.js';

/**
 * Предметы карты (мебель). Предмет — функция, которая строит блоки в СВОЕЙ системе координат:
 * центр основания в (0, 0, 0), «лицом» (сиденьем, полками) к +Z. Карта ставит предмет в точку
 * и поворачивает на 0/90/180/270° — тогда блоки остаются выровненными по осям, и физика их понимает.
 *
 * Вид и столкновения — из одних и тех же блоков: сервер берёт твёрдые (solid !== false),
 * клиент рисует все. Так «видно диван» и «упёрся в диван» не могут разойтись.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PropPlacement {
  prop: PropId;
  x: number;
  z: number;
  /** Высота основания (поставить на стол или полку). */
  y?: number;
  rot?: Rotation;
  /** Основной цвет (обивка, корпус). У каждого предмета свой цвет по умолчанию. */
  color?: string;
  /** Второй цвет (подушки, ножки, горшок). */
  accent?: string;
  /** Длина/ширина вдоль локального X, где у предмета есть выбор (диван на 2 или 3 места). */
  length?: number;
}

type PropBuilder = (p: Required<Pick<PropPlacement, 'color' | 'accent' | 'length'>>, random: () => number) => MapBox[];

interface PropDef {
  color: string;
  accent: string;
  length: number;
  build: PropBuilder;
}

/**
 * Детерминированный генератор случайных чисел (mulberry32): одно и то же зерно — одна и та же
 * последовательность. Корешки книг «случайные», но у всех игроков одинаковые.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Яркие корешки книг — пёстрая полка, на фоне которой интересно прятаться. */
const BOOK_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a', '#8d99ae', '#6a4c93', '#f1faee', '#118ab2'];

const PROP_DEFS = {
  /** Стол: толстая скруглённая столешница на четырёх ножках. Под ним можно пролезть ползком. */
  table: {
    color: '#a47148',
    accent: '#7f5539',
    length: 1.6,
    build: ({ color, accent, length }) => {
      const d = 0.9;
      const h = 0.78;
      const top = 0.06;
      const leg = 0.07;
      const lx = length / 2 - 0.1;
      const lz = d / 2 - 0.1;
      return [
        { x: 0, z: 0, y: h - top, w: length, h: top, d, color, shape: 'rounded', round: 0.025, surface: 'wood' },
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map(
            (sz): MapBox => ({ x: sx * lx, z: sz * lz, w: leg, h: h - top, d: leg, color: accent, shape: 'cylinder', surface: 'wood' }),
          ),
        ),
      ];
    },
  },
  /** Диван: основание, спинка, подлокотники и мягкие подушки — всё скруглённое, обивка — ткань. */
  sofa: {
    color: '#6a4c93',
    accent: '#8e6cc0',
    length: 2.2,
    build: ({ color, accent, length }) => {
      const d = 0.95;
      const arm = 0.22;
      const seats = Math.max(1, Math.round((length - 2 * arm) / 0.95));
      const seatW = (length - 2 * arm) / seats;
      const boxes: MapBox[] = [
        { x: 0, z: 0, w: length, h: 0.38, d, color, shape: 'rounded', round: 0.06, surface: 'fabric' },
        { x: 0, z: -d / 2 + 0.11, y: 0.38, w: length, h: 0.5, d: 0.22, color, shape: 'rounded', round: 0.09, surface: 'fabric' },
        { x: -length / 2 + arm / 2, z: 0, y: 0.38, w: arm, h: 0.24, d, color, shape: 'rounded', round: 0.09, surface: 'fabric' },
        { x: length / 2 - arm / 2, z: 0, y: 0.38, w: arm, h: 0.24, d, color, shape: 'rounded', round: 0.09, surface: 'fabric' },
      ];
      for (let i = 0; i < seats; i++) {
        const x = -length / 2 + arm + seatW * (i + 0.5);
        // Подушки сиденья и спины — только вид: их коробки внутри основания и спинки.
        boxes.push(
          { x, z: 0.08, y: 0.36, w: seatW - 0.04, h: 0.14, d: d - 0.28, color: accent, shape: 'rounded', round: 0.06, surface: 'fabric', solid: false },
          { x, z: -d / 2 + 0.26, y: 0.5, w: seatW - 0.06, h: 0.36, d: 0.14, color: accent, shape: 'rounded', round: 0.06, surface: 'fabric', solid: false },
        );
      }
      return boxes;
    },
  },
  /**
   * Книжный шкаф: корпус и полки, на полках — книги разной высоты и цвета.
   * Видимые части не твёрдые, а для физики — одна скрытая коробка во весь шкаф: иначе каждая
   * книга была бы ступенькой, а лишние коллайдеры — работой для сервера.
   */
  bookshelf: {
    color: '#d4a373',
    accent: '#000000',
    length: 1.2,
    build: ({ color, length }, random) => {
      const h = 2;
      const d = 0.4;
      const wall = 0.04;
      const shelves = 5;
      const step = (h - wall) / shelves;
      const panel = (box: Omit<MapBox, 'color' | 'surface' | 'solid'>): MapBox => ({ ...box, color, surface: 'wood', solid: false });
      const boxes: MapBox[] = [
        { x: 0, z: 0, w: length, h, d, color, hidden: true },
        panel({ x: 0, z: -d / 2 + 0.01, w: length, h, d: 0.02 }),
        panel({ x: -length / 2 + wall / 2, z: 0, w: wall, h, d }),
        panel({ x: length / 2 - wall / 2, z: 0, w: wall, h, d }),
      ];
      for (let i = 0; i <= shelves; i++) boxes.push(panel({ x: 0, z: 0, y: i * step, w: length - 2 * wall, h: wall, d }));
      for (let i = 0; i < shelves; i++) {
        let x = -length / 2 + wall + 0.01;
        while (x < length / 2 - wall - 0.08) {
          const w = 0.03 + random() * 0.04;
          const bookHeight = (step - wall) * (0.55 + random() * 0.35);
          const bookColor = BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)];
          // Иногда пропуск — полка выглядит живой, а не забитой под линейку.
          if (random() > 0.12) {
            boxes.push({ x: x + w / 2, z: 0.02, y: i * step + wall, w, h: bookHeight, d: d - 0.1, color: bookColor, solid: false });
          }
          x += w + 0.004;
        }
      }
      return boxes;
    },
  },
  /** Растение в горшке: горшок (твёрдый) и шар листвы (сквозь листву можно пройти — за ней удобно прятаться). */
  plant: {
    color: '#52b788',
    accent: '#bc6c25',
    length: 0.5,
    build: ({ color, accent, length }) => [
      { x: 0, z: 0, w: length * 0.7, h: 0.45, d: length * 0.7, color: accent, shape: 'cylinder' },
      { x: 0, z: 0, y: 0.4, w: length * 1.5, h: length * 1.7, d: length * 1.5, color, shape: 'sphere', surface: 'carpet', solid: false },
    ],
  },
  /** Ковёр: тонкий, на него заходишь сам (ниже ступеньки). */
  rug: {
    color: '#c75b7a',
    accent: '#000000',
    length: 3,
    build: ({ color, length }) => [{ x: 0, z: 0, w: length, h: 0.025, d: length * 0.66, color, surface: 'carpet', shape: 'rounded', round: 0.01 }],
  },
} satisfies Record<string, PropDef>;

export type PropId = keyof typeof PROP_DEFS;
export const PROP_IDS = Object.keys(PROP_DEFS) as PropId[];

/**
 * Поставить предмет на карту: построить блоки, повернуть вокруг вертикали и сдвинуть в точку.
 * Поворот как у three.js rotation.y: x' = x·cos + z·sin, z' = −x·sin + z·cos. На 90° и 270°
 * ширина и глубина блока меняются местами — блок по-прежнему выровнен по осям.
 */
export function placeProp(placement: PropPlacement): MapBox[] {
  const def: PropDef = PROP_DEFS[placement.prop];
  // Зерно — от места на карте: два одинаковых шкафа в разных углах выглядят по-разному.
  const random = seededRandom(Math.round(placement.x * 1000) * 31 + Math.round(placement.z * 1000) * 17);
  const local = def.build(
    {
      color: placement.color ?? def.color,
      accent: placement.accent ?? def.accent,
      length: placement.length ?? def.length,
    },
    random,
  );
  const rot = placement.rot ?? 0;
  const cos = Math.round(Math.cos((rot * Math.PI) / 180));
  const sin = Math.round(Math.sin((rot * Math.PI) / 180));
  const swap = rot === 90 || rot === 270;
  return local.map((box) => ({
    ...box,
    x: placement.x + box.x * cos + box.z * sin,
    z: placement.z - box.x * sin + box.z * cos,
    y: (placement.y ?? 0) + (box.y ?? 0),
    w: swap ? box.d : box.w,
    d: swap ? box.w : box.d,
  }));
}
