import type { MapBox } from '../map.js';
import { BRIGHT, collider, decor, part, pick, type PropDef } from './kit.js';

/** Прихожая, детская и всякое: игрушки, вешалка, коробки. */
export const MISC = {
  /** Ящик с игрушками: из-под крышки торчат мячи и кубики. */
  toyBox: {
    color: '#ffb703',
    accent: '#fb8500',
    length: 0.9,
    build: ({ color, accent, length }, random) => {
      const d = 0.55;
      const boxes: MapBox[] = [
        part(0, 0, 0, length, 0.48, d, color, { shape: 'rounded', round: 0.04, surface: 'wood' }),
        decor(0, 0.48, -d / 2 + 0.03, length, 0.32, 0.04, accent, { shape: 'rounded', round: 0.02, surface: 'wood' }),
      ];
      for (let i = 0; i < 5; i++) {
        const size = 0.12 + random() * 0.1;
        const x = (random() - 0.5) * (length - size - 0.1);
        const z = (random() - 0.5) * (d - size - 0.1);
        const ball = random() > 0.5;
        boxes.push(
          decor(x, 0.4, z, size, size, size, pick(BRIGHT, random), ball ? { shape: 'sphere' } : { shape: 'rounded', round: 0.02 }),
        );
      }
      return boxes;
    },
  },

  /** Кресло-мешок: большой мягкий шар, слегка приплюснутый. Рядом с ним «мешком» лечь — неплохая маскировка. */
  beanbag: {
    color: '#e76f51',
    accent: '#000000',
    length: 0.95,
    build: ({ color, length }) => [part(0, 0, 0, length, length * 0.68, length, color, { shape: 'sphere', surface: 'fabric' })],
  },

  /**
   * Вешалка с пальто. Твёрдая только стойка: сквозь пальто можно пройти и встать среди них —
   * если покраситься в цвет пальто, ищущий увидит ещё одно пальто.
   */
  coatRack: {
    color: '#6f4e37',
    accent: '#000000',
    length: 0.6,
    build: ({ color }, random) => {
      const boxes: MapBox[] = [
        part(0, 0, 0, 0.45, 0.04, 0.45, color, { shape: 'cylinder', surface: 'wood' }),
        part(0, 0.04, 0, 0.05, 1.75, 0.05, color, { shape: 'cylinder', surface: 'wood' }),
        decor(0, 1.79, 0, 0.1, 0.06, 0.1, color, { shape: 'sphere', surface: 'wood' }),
      ];
      const coats = ['#264653', '#8d99ae', '#bc6c25', '#6d597a'];
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + random() * 0.5;
        const r = 0.17;
        boxes.push(
          decor(Math.cos(angle) * 0.04, 1.62, Math.sin(angle) * 0.04, 0.03, 0.03, 0.18, color, { shape: 'rounded', round: 0.01 }),
          decor(Math.cos(angle) * r, 0.75, Math.sin(angle) * r, 0.42, 0.88, 0.2, pick(coats, random), {
            shape: 'rounded',
            round: 0.08,
            surface: 'fabric',
          }),
        );
      }
      return boxes;
    },
  },

  /** Обувница: низкая полка, на ней пары обуви. */
  shoeRack: {
    color: '#ccd5ae',
    accent: '#000000',
    length: 0.9,
    build: ({ color, length }, random) => {
      const d = 0.32;
      const boxes: MapBox[] = [
        collider(0, 0, 0, length, 0.45, d),
        decor(0, 0, 0, length, 0.03, d, color, { surface: 'wood' }),
        decor(0, 0.22, 0, length, 0.03, d, color, { surface: 'wood' }),
        decor(0, 0.42, 0, length, 0.03, d, color, { surface: 'wood' }),
        decor(-length / 2 + 0.015, 0, 0, 0.03, 0.45, d, color, { surface: 'wood' }),
        decor(length / 2 - 0.015, 0, 0, 0.03, 0.45, d, color, { surface: 'wood' }),
      ];
      for (const shelf of [0.03, 0.25]) {
        let x = -length / 2 + 0.08;
        while (x < length / 2 - 0.12) {
          const shoe = pick(BRIGHT, random);
          for (const offset of [-0.035, 0.035]) {
            boxes.push(decor(x + offset, shelf, 0.01, 0.06, 0.08, 0.24, shoe, { shape: 'rounded', round: 0.03 }));
          }
          x += 0.19;
        }
      }
      return boxes;
    },
  },

  /** Картонная коробка с полосой скотча. Можно ставить стопкой через y. length — размер стороны. */
  cardboardBox: {
    color: '#c8a26b',
    accent: '#e3c58f',
    length: 0.6,
    build: ({ color, accent, length }) => [
      part(0, 0, 0, length, length * 0.8, length, color, { shape: 'rounded', round: 0.015 }),
      decor(0, length * 0.8 - 0.002, 0, 0.08, 0.006, length + 0.004, accent),
    ],
  },
} satisfies Record<string, PropDef>;
