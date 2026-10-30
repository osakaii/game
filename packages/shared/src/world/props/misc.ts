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
        // Игрушки торчат из ящика и твёрдые: лёжа среди них на крышке (×3 — до 0.4 м) не спрячешься.
        boxes.push(
          part(x, 0.4, z, size, size, size, pick(BRIGHT, random), ball ? { shape: 'sphere' } : { shape: 'rounded', round: 0.02 }),
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

  /**
   * Картина в раме — на стену (строится от пола, на карте поднимается через y). Только вид.
   * Сюжет рисует клиент по зерну art: у каждой картины свой, у всех игроков одинаковый.
   * length — ширина рамы; высота — 3/4 ширины.
   */
  painting: {
    color: '#8a5a35',
    accent: '#000000',
    length: 0.9,
    build: ({ color, length }, random) => {
      const h = length * 0.75;
      const border = Math.min(0.07, length * 0.08);
      return [
        decor(0, 0, 0, length, h, 0.05, color, { shape: 'rounded', round: 0.012, surface: 'wood' }),
        { ...decor(0, border, 0.02, length - 2 * border, h - 2 * border, 0.02, '#ffffff'), art: Math.floor(random() * 2 ** 31) },
      ];
    },
  },

  /**
   * Окно со шторами — на внешнюю стену, стоит на полу. Стекло светится «небом».
   * Шторы до пола и не твёрдые: за ними (и в них) можно встать — классический тайник.
   * length — ширина проёма окна; color — рама, accent — шторы.
   */
  window: {
    color: '#fbfbf8',
    accent: '#e9c46a',
    length: 1.4,
    build: ({ color, accent, length }) => {
      const sill = 0.9;
      const h = 1.35;
      const frame = 0.07;
      const glass = { glow: true } as const;
      return [
        decor(0, sill, 0, length, h, 0.08, color, { shape: 'rounded', round: 0.015 }),
        // Стекло — на сантиметр перед рамой, перемычка — ещё на сантиметр: если грани лежат в одной
        // плоскости, видеокарта не решит, какая ближе, и они «мерцают» (z-fighting).
        decor(-length / 4, sill + frame, 0.05, length / 2 - frame * 1.5, h - 2 * frame, 0.01, '#cfe8ff', glass),
        decor(length / 4, sill + frame, 0.05, length / 2 - frame * 1.5, h - 2 * frame, 0.01, '#cfe8ff', glass),
        decor(0, sill + frame, 0.065, 0.05, h - 2 * frame, 0.02, color),
        decor(0, sill - 0.04, 0.08, length + 0.2, 0.04, 0.2, color, { shape: 'rounded', round: 0.01 }),
        decor(0, 2.45, 0.12, length + 0.9, 0.04, 0.04, '#8d99ae', { shape: 'cylinder' }),
        decor(-length / 2 - 0.25, 0, 0.14, 0.5, 2.45, 0.12, accent, { shape: 'rounded', round: 0.05, surface: 'fabric' }),
        decor(length / 2 + 0.25, 0, 0.14, 0.5, 2.45, 0.12, accent, { shape: 'rounded', round: 0.05, surface: 'fabric' }),
      ];
    },
  },

  /** Люстра — под потолок (строится от пола, на карте поднимается через y). Плафон светится. Только вид. */
  ceilingLamp: {
    color: '#fff3d6',
    accent: '#c9ccd1',
    length: 0.6,
    build: ({ color, accent, length }) => [
      decor(0, 0.25, 0, 0.03, 0.37, 0.03, accent, { shape: 'cylinder' }),
      decor(0, 0, 0, length, 0.28, length, color, { shape: 'sphere', glow: true }),
    ],
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
