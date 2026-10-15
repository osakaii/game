import type { MapBox } from '../map.js';
import { collider, decor, handle, legs, part, seam, type PropDef } from './kit.js';

const DOOR = 0.6; // ширина дверцы кухонного шкафа, м
const COUNTER_H = 0.9;
const COUNTER_D = 0.62;

/** Нижний шкаф кухни: корпус, тёмный цоколь, дверцы со швами и ручками. Столешницу кладёт вызывающий. */
function baseCabinet(length: number, color: string): MapBox[] {
  const front = COUNTER_D / 2 - 0.02;
  const doors = Math.max(1, Math.round(length / DOOR));
  const dw = length / doors;
  const boxes: MapBox[] = [
    part(0, 0, -0.02, length, COUNTER_H - 0.04, COUNTER_D - 0.04, color, { shape: 'rounded', round: 0.015 }),
    decor(0, 0, front + 0.001, length - 0.02, 0.1, 0.004, '#2b2d42'),
  ];
  for (let i = 0; i < doors; i++) {
    const x = -length / 2 + dw * (i + 0.5);
    if (i > 0) boxes.push(seam(-length / 2 + dw * i, 0.12, front, 0.006, COUNTER_H - 0.18));
    boxes.push(handle(x + dw / 2 - 0.07, COUNTER_H - 0.2, front, true));
  }
  return boxes;
}

/** Столешница: чуть шире шкафа, со скруглёнными кромками. */
function countertop(length: number, color: string): MapBox {
  return part(0, COUNTER_H - 0.04, 0, length + 0.02, 0.04, COUNTER_D, color, { shape: 'rounded', round: 0.012, surface: 'marble' });
}

/** Кухня: гарнитур, техника, обеденные стулья. */
export const KITCHEN_PROPS = {
  /** Кухонная тумба со столешницей под мрамор. Ставятся в ряд вдоль стены. */
  kitchenCounter: {
    color: '#f1ece2',
    accent: '#d9d4cc',
    length: 1.8,
    build: ({ color, accent, length }) => [...baseCabinet(length, color), countertop(length, accent)],
  },

  /** Тумба с мойкой: в столешнице — тёмная чаша, над ней — кран. */
  sinkCounter: {
    color: '#f1ece2',
    accent: '#d9d4cc',
    length: 1.2,
    build: ({ color, accent, length }) => [
      ...baseCabinet(length, color),
      countertop(length, accent),
      decor(0, COUNTER_H - 0.005, 0.02, 0.55, 0.01, 0.4, '#8d99ae', { shape: 'rounded', round: 0.004 }),
      decor(0, COUNTER_H, -0.22, 0.04, 0.3, 0.04, '#c9ccd1', { shape: 'cylinder' }),
      decor(0, COUNTER_H + 0.27, -0.12, 0.035, 0.035, 0.2, '#c9ccd1', { shape: 'rounded', round: 0.015 }),
    ],
  },

  /** Плита: духовка со стеклом, ручка, чёрная варочная панель с четырьмя конфорками и ручки переключателей. */
  stove: {
    color: '#f8f9fa',
    accent: '#1b1f2a',
    length: 0.6,
    build: ({ color, accent, length }) => {
      const front = COUNTER_D / 2 - 0.02;
      const boxes: MapBox[] = [
        part(0, 0, -0.02, length, COUNTER_H - 0.03, COUNTER_D - 0.04, color, { shape: 'rounded', round: 0.02 }),
        part(0, COUNTER_H - 0.03, -0.01, length, 0.03, COUNTER_D - 0.02, accent, { shape: 'rounded', round: 0.01 }),
        decor(0, 0.2, front + 0.002, length - 0.12, 0.38, 0.004, '#2b2d42', { shape: 'rounded', round: 0.02 }),
        decor(0, 0.66, front + 0.025, length - 0.16, 0.025, 0.025, '#c9ccd1', { shape: 'cylinder' }),
      ];
      for (const [x, z] of [
        [-0.14, -0.13],
        [0.14, -0.13],
        [-0.14, 0.11],
        [0.14, 0.11],
      ]) {
        boxes.push(decor(x, COUNTER_H, z, 0.17, 0.008, 0.17, '#4a4e69', { shape: 'cylinder' }));
      }
      for (let i = 0; i < 4; i++) boxes.push(decor(-0.18 + i * 0.12, 0.76, front + 0.015, 0.04, 0.04, 0.03, '#8d99ae', { shape: 'cylinder' }));
      return boxes;
    },
  },

  /** Холодильник: высокий, скруглённый, морозилка снизу и две ручки. */
  fridge: {
    color: '#f8f9fa',
    accent: '#c9ccd1',
    length: 0.72,
    build: ({ color, accent, length }) => {
      const d = 0.7;
      const h = 1.85;
      const front = d / 2;
      return [
        part(0, 0, 0, length, h, d, color, { shape: 'rounded', round: 0.05 }),
        seam(0, 0.62, front, length - 0.04, 0.008),
        decor(length / 2 - 0.08, 0.95, front + 0.03, 0.03, 0.55, 0.04, accent, { shape: 'rounded', round: 0.012 }),
        decor(length / 2 - 0.08, 0.3, front + 0.03, 0.03, 0.25, 0.04, accent, { shape: 'rounded', round: 0.012 }),
      ];
    },
  },

  /** Навесной шкаф: строится от пола, на карте поднимается через y (обычно 1.45 м). */
  upperCabinet: {
    color: '#f1ece2',
    accent: '#c9ccd1',
    length: 1.2,
    build: ({ color, length }) => {
      const d = 0.35;
      const h = 0.7;
      const doors = Math.max(1, Math.round(length / DOOR));
      const dw = length / doors;
      const boxes: MapBox[] = [part(0, 0, 0, length, h, d, color, { shape: 'rounded', round: 0.015 })];
      for (let i = 0; i < doors; i++) {
        if (i > 0) boxes.push(seam(-length / 2 + dw * i, 0.03, d / 2, 0.006, h - 0.06));
        boxes.push(handle(-length / 2 + dw * (i + 1) - 0.07, 0.12, d / 2, true));
      }
      return boxes;
    },
  },

  /** Стул: сиденье, спинка, ножки. Для физики — сиденье и спинка; между ножками пусто. */
  chair: {
    color: '#bc8a5f',
    accent: '#e76f51',
    length: 0.46,
    build: ({ color, accent, length }) => {
      const d = 0.46;
      return [
        collider(0, 0, 0, length, 0.47, d),
        decor(0, 0.43, 0, length, 0.04, d, color, { shape: 'rounded', round: 0.015, surface: 'wood' }),
        decor(0, 0.47, 0.01, length - 0.06, 0.04, d - 0.08, accent, { shape: 'rounded', round: 0.02, surface: 'fabric' }),
        ...legs(length, d, 0.43, 0.04, 0.035, color).map((leg) => ({ ...leg, solid: false })),
        part(0, 0.47, -d / 2 + 0.02, length, 0.45, 0.04, color, { shape: 'rounded', round: 0.015, surface: 'wood' }),
      ];
    },
  },
} satisfies Record<string, PropDef>;
