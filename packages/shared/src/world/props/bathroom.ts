import { decor, part, type PropDef } from './kit.js';

const PORCELAIN = '#f8f9fa';
const CHROME = '#c9ccd1';

/** Ванная: ванна, унитаз, раковина, зеркало, стиральная машина. */
export const BATHROOM = {
  /**
   * Ванна — полая: дно и четыре бортика, а не сплошной блок. Внутрь можно запрыгнуть и лечь
   * пластом — борта закроют от ищущего с любой стороны, кроме взгляда сверху.
   * Внутренний размер больше диаметра игрока (0.7 м) — иначе физика не пустила бы внутрь.
   */
  bathtub: {
    color: PORCELAIN,
    accent: '#90e0ef',
    length: 1.8,
    build: ({ color, accent, length }) => {
      const d = 0.98;
      const h = 0.58;
      const rim = 0.08;
      const soft = { shape: 'rounded', round: 0.04 } as const;
      return [
        part(0, 0, 0, length, 0.12, d, color, soft),
        part(0, 0, -d / 2 + rim / 2, length, h, rim, color, soft),
        part(0, 0, d / 2 - rim / 2, length, h, rim, color, soft),
        part(-length / 2 + rim / 2, 0, 0, rim, h, d, color, soft),
        part(length / 2 - rim / 2, 0, 0, rim, h, d, color, soft),
        // Немного воды на дне и кран у изголовья.
        decor(0, 0.12, 0, length - 2 * rim - 0.02, 0.02, d - 2 * rim - 0.02, accent),
        decor(-length / 2 + 0.05, h, 0, 0.04, 0.22, 0.04, CHROME, { shape: 'cylinder' }),
        decor(-length / 2 + 0.13, h + 0.18, 0, 0.18, 0.035, 0.035, CHROME, { shape: 'rounded', round: 0.015 }),
      ];
    },
  },

  /** Унитаз: чаша, бачок, сиденье с крышкой. */
  toilet: {
    color: PORCELAIN,
    accent: '#e9ecef',
    length: 0.42,
    build: ({ color, accent, length }) => {
      const soft = { shape: 'rounded', round: 0.06 } as const;
      return [
        part(0, 0, 0.05, length - 0.06, 0.4, 0.55, color, soft),
        part(0, 0.42, 0.06, length, 0.04, 0.5, accent, { shape: 'rounded', round: 0.02 }),
        part(0, 0.36, -0.22, length, 0.42, 0.2, color, { shape: 'rounded', round: 0.04 }),
        decor(0.1, 0.78, -0.22, 0.06, 0.02, 0.03, CHROME, { shape: 'rounded', round: 0.01 }),
      ];
    },
  },

  /** Раковина на ножке и кран. */
  washbasin: {
    color: PORCELAIN,
    accent: '#8d99ae',
    length: 0.6,
    build: ({ color, accent, length }) => [
      part(0, 0, -0.02, 0.2, 0.74, 0.2, color, { shape: 'cylinder' }),
      part(0, 0.72, 0, length, 0.15, 0.45, color, { shape: 'rounded', round: 0.06 }),
      decor(0, 0.86, 0.03, length - 0.14, 0.01, 0.28, accent, { shape: 'rounded', round: 0.004 }),
      decor(0, 0.87, -0.18, 0.035, 0.18, 0.035, CHROME, { shape: 'cylinder' }),
      decor(0, 1.02, -0.12, 0.03, 0.03, 0.14, CHROME, { shape: 'rounded', round: 0.012 }),
    ],
  },

  /** Зеркало в раме — на стену (строится от пола, на карте поднимается через y). Только вид. */
  mirror: {
    color: '#cfe8f3',
    accent: '#b08968',
    length: 0.7,
    build: ({ color, accent, length }) => [
      decor(0, 0, 0, length, length * 1.25, 0.04, accent, { shape: 'rounded', round: 0.02, surface: 'wood' }),
      decor(0, 0.04, 0.016, length - 0.08, length * 1.25 - 0.08, 0.012, color),
    ],
  },

  /** Стиральная машина: панель управления сверху, круглый люк спереди. */
  washingMachine: {
    color: PORCELAIN,
    accent: '#495057',
    length: 0.6,
    build: ({ color, accent, length }) => {
      const d = 0.6;
      return [
        part(0, 0, 0, length, 0.85, d, color, { shape: 'rounded', round: 0.04 }),
        decor(0, 0.72, d / 2 + 0.002, length - 0.06, 0.1, 0.006, '#dee2e6'),
        decor(length / 2 - 0.12, 0.74, d / 2 + 0.01, 0.06, 0.06, 0.03, '#8d99ae', { shape: 'cylinder' }),
        // Люк — сплющенный шар: круглое окно на передней грани.
        decor(0, 0.18, d / 2, 0.42, 0.42, 0.06, '#adb5bd', { shape: 'sphere' }),
        decor(0, 0.22, d / 2 + 0.012, 0.32, 0.32, 0.05, accent, { shape: 'sphere' }),
      ];
    },
  },
} satisfies Record<string, PropDef>;
