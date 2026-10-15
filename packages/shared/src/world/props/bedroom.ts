import type { MapBox } from '../map.js';
import { decor, handle, legs, part, seam, type PropDef } from './kit.js';

/**
 * Высота ножек кровати — чуть выше роста лежащего «пластом» (0.5 м):
 * под кроватью можно спрятаться — классическое место, которое ищущий обязан проверить.
 */
const BED_CLEARANCE = 0.54;

/** Спальня: кровать, тумбочка, шкаф, комод, письменный стол. */
export const BEDROOM = {
  /** Кровать: высокие ножки, рама, матрас, изголовье, подушки и одеяло, свисающее спереди. */
  bed: {
    color: '#b08968',
    accent: '#a2d2ff',
    length: 1.6,
    build: ({ color, accent, length }) => {
      const d = 2.1;
      const frameTop = BED_CLEARANCE + 0.16;
      const mattressTop = frameTop + 0.22;
      const soft = { shape: 'rounded', round: 0.06, surface: 'fabric' } as const;
      const pillows = length > 1.2 ? 2 : 1;
      const boxes: MapBox[] = [
        ...legs(length, d, BED_CLEARANCE, 0.07, 0.08, color, 'box'),
        part(0, BED_CLEARANCE, 0, length, 0.16, d, color, { shape: 'rounded', round: 0.03, surface: 'wood' }),
        part(0, frameTop, 0.02, length - 0.06, 0.22, d - 0.08, '#f8f9fa', soft),
        part(0, 0, -d / 2 + 0.05, length + 0.04, 1.25, 0.1, color, { shape: 'rounded', round: 0.05, surface: 'wood' }),
        // Одеяло лежит на нижних двух третях и свисает с изножья.
        decor(0, mattressTop - 0.04, 0.3, length - 0.02, 0.07, d * 0.62, accent, { ...soft, round: 0.03 }),
        decor(0, frameTop - 0.08, d / 2 - 0.03, length - 0.02, 0.32, 0.05, accent, { ...soft, round: 0.02 }),
      ];
      for (let i = 0; i < pillows; i++) {
        const x = pillows === 1 ? 0 : (i - 0.5) * (length / 2);
        boxes.push(decor(x, mattressTop - 0.02, -d / 2 + 0.38, length / pillows - 0.16, 0.14, 0.42, '#ffffff', { ...soft, round: 0.06 }));
      }
      return boxes;
    },
  },

  /** Тумбочка с ящиком и маленькой лампой. */
  nightstand: {
    color: '#b08968',
    accent: '#ffd6a5',
    length: 0.5,
    build: ({ color, accent, length }) => {
      const d = 0.42;
      return [
        part(0, 0.06, 0, length, 0.5, d, color, { shape: 'rounded', round: 0.02, surface: 'wood' }),
        ...legs(length, d, 0.06, 0.05, 0.04, color),
        seam(0, 0.38, d / 2, length - 0.04, 0.006),
        handle(0, 0.46, d / 2),
        decor(0.08, 0.56, -0.05, 0.12, 0.02, 0.12, '#6c757d', { shape: 'cylinder' }),
        decor(0.08, 0.58, -0.05, 0.02, 0.18, 0.02, '#6c757d', { shape: 'cylinder' }),
        decor(0.08, 0.72, -0.05, 0.2, 0.16, 0.2, accent, { shape: 'cylinder', surface: 'fabric' }),
      ];
    },
  },

  /** Платяной шкаф: две дверцы с вертикальными ручками, карниз сверху. Высокий — за ним «слепая зона». */
  wardrobe: {
    color: '#ede0d4',
    accent: '#9c6644',
    length: 1.2,
    build: ({ color, accent, length }) => {
      const d = 0.6;
      const h = 2.1;
      return [
        part(0, 0.06, 0, length, h - 0.1, d, color, { shape: 'rounded', round: 0.02, surface: 'wood' }),
        part(0, h - 0.04, 0, length + 0.05, 0.05, d + 0.04, accent, { shape: 'rounded', round: 0.015, surface: 'wood' }),
        part(0, 0, 0, length - 0.04, 0.06, d - 0.04, accent),
        seam(0, 0.1, d / 2, 0.008, h - 0.2),
        handle(-0.06, 1.05, d / 2, true),
        handle(0.06, 1.05, d / 2, true),
      ];
    },
  },

  /** Комод: четыре широких ящика с двумя ручками каждый. */
  dresser: {
    color: '#ffcdb2',
    accent: '#b5838d',
    length: 1.1,
    build: ({ color, accent, length }) => {
      const d = 0.5;
      const rows = 4;
      const boxes: MapBox[] = [
        part(0, 0.08, 0, length, 0.86, d, color, { shape: 'rounded', round: 0.025, surface: 'wood' }),
        ...legs(length, d, 0.08, 0.06, 0.05, accent),
      ];
      for (let i = 0; i < rows; i++) {
        const y = 0.1 + i * 0.21;
        if (i > 0) boxes.push(seam(0, y - 0.004, d / 2, length - 0.04, 0.006));
        boxes.push(handle(-length / 4, y + 0.1, d / 2, false, accent), handle(length / 4, y + 0.1, d / 2, false, accent));
      }
      return boxes;
    },
  },

  /** Письменный стол: столешница, тумба с ящиками справа и стенка слева. Под ним можно залечь. */
  desk: {
    color: '#f2e8cf',
    accent: '#6a994e',
    length: 1.3,
    build: ({ color, accent, length }) => {
      const d = 0.65;
      const h = 0.76;
      const drawerW = 0.42;
      const boxes: MapBox[] = [
        part(0, h - 0.04, 0, length, 0.04, d, color, { shape: 'rounded', round: 0.015, surface: 'wood' }),
        part(-length / 2 + 0.02, 0, 0, 0.04, h - 0.04, d - 0.04, color, { surface: 'wood' }),
        part(length / 2 - drawerW / 2, 0, 0, drawerW, h - 0.04, d - 0.04, color, { shape: 'rounded', round: 0.01, surface: 'wood' }),
      ];
      for (let i = 0; i < 3; i++) {
        const y = 0.06 + i * 0.22;
        if (i > 0) boxes.push(seam(length / 2 - drawerW / 2, y - 0.004, d / 2 - 0.02, drawerW - 0.03, 0.006));
        boxes.push(handle(length / 2 - drawerW / 2, y + 0.11, d / 2 - 0.02, false, accent));
      }
      return boxes;
    },
  },
} satisfies Record<string, PropDef>;
