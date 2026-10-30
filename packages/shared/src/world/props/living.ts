import type { MapBox } from '../map.js';
import { BRIGHT, collider, decor, handle, legs, part, pick, seam, type PropDef } from './kit.js';

/** Гостиная: мягкая мебель, столы, полки, техника. */
export const LIVING = {
  /** Стол: скруглённая столешница на четырёх ножках. Под ним можно проползти пластом. */
  table: {
    color: '#a47148',
    accent: '#7f5539',
    length: 1.6,
    build: ({ color, accent, length }) => {
      const d = 0.9;
      const h = 0.78;
      return [
        part(0, h - 0.06, 0, length, 0.06, d, color, { shape: 'rounded', round: 0.025, surface: 'wood' }),
        ...legs(length, d, h - 0.06, 0.1, 0.07, accent),
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
      const soft = { shape: 'rounded', round: 0.09, surface: 'fabric' } as const;
      const boxes: MapBox[] = [
        part(0, 0, 0, length, 0.38, d, color, { ...soft, round: 0.06 }),
        part(0, 0.38, -d / 2 + 0.11, length, 0.5, 0.22, color, soft),
        part(-length / 2 + arm / 2, 0.38, 0, arm, 0.24, d, color, soft),
        part(length / 2 - arm / 2, 0.38, 0, arm, 0.24, d, color, soft),
      ];
      for (let i = 0; i < seats; i++) {
        const x = -length / 2 + arm + seatW * (i + 0.5);
        // Подушки твёрдые: «только вид» толщиной 0.4 м (×3) — лёг на диван и утонул в подушках.
        boxes.push(
          part(x, 0.36, 0.08, seatW - 0.04, 0.14, d - 0.28, accent, { ...soft, round: 0.06 }),
          part(x, 0.5, -d / 2 + 0.26, seatW - 0.06, 0.36, 0.14, accent, { ...soft, round: 0.06 }),
        );
      }
      return boxes;
    },
  },

  /** Кресло: как диван на одного, с высокими подлокотниками. За ним и рядом удобно присесть. */
  armchair: {
    color: '#2a9d8f',
    accent: '#52c4b6',
    length: 0.95,
    build: ({ color, accent, length }) => {
      const d = 0.9;
      const soft = { shape: 'rounded', round: 0.09, surface: 'fabric' } as const;
      return [
        part(0, 0.08, 0, length, 0.34, d, color, { ...soft, round: 0.07 }),
        part(0, 0.42, -d / 2 + 0.12, length, 0.55, 0.24, color, soft),
        part(-length / 2 + 0.11, 0.42, 0.02, 0.22, 0.3, d - 0.04, color, soft),
        part(length / 2 - 0.11, 0.42, 0.02, 0.22, 0.3, d - 0.04, color, soft),
        part(0, 0.4, 0.08, length - 0.44, 0.13, d - 0.3, accent, { ...soft, round: 0.06 }),
        ...legs(length, d, 0.08, 0.08, 0.06, '#5a3e2b'),
      ];
    },
  },

  /** Журнальный столик с нижней полкой, на полке — стопка журналов. */
  coffeeTable: {
    color: '#c68b59',
    accent: '#8a5a35',
    length: 1.1,
    build: ({ color, accent, length }, random) => {
      const d = 0.6;
      const boxes: MapBox[] = [
        part(0, 0.37, 0, length, 0.05, d, color, { shape: 'rounded', round: 0.02, surface: 'wood' }),
        part(0, 0.1, 0, length - 0.1, 0.03, d - 0.1, color, { surface: 'wood' }),
        ...legs(length, d, 0.37, 0.06, 0.05, accent, 'box'),
      ];
      for (let i = 0; i < 3; i++) {
        boxes.push(decor(-length / 4 + random() * 0.05, 0.13 + i * 0.012, random() * 0.05, 0.3, 0.012, 0.22, pick(BRIGHT, random)));
      }
      return boxes;
    },
  },

  /** Тумба под телевизор и сам телевизор: тёмный экран — хорошая «тень», рядом с ним тёмное не заметно. */
  tvStand: {
    color: '#3d405b',
    accent: '#1b1f2a',
    length: 1.8,
    build: ({ color, accent, length }) => {
      const d = 0.45;
      const tvW = Math.min(1.5, length - 0.2);
      return [
        part(0, 0.06, 0, length, 0.44, d, color, { shape: 'rounded', round: 0.02, surface: 'wood' }),
        decor(-length / 4, 0.14, d / 2 + 0.002, length / 2 - 0.12, 0.28, 0.004, '#2b2d42'),
        seam(length / 4, 0.14, d / 2, 0.006, 0.28),
        handle(length / 4 - 0.06, 0.32, d / 2, true),
        handle(length / 4 + 0.06, 0.32, d / 2, true),
        ...legs(length, d, 0.06, 0.08, 0.05, '#1b1f2a', 'box'),
        // Подставка и экран
        part(0, 0.5, -0.05, 0.3, 0.02, 0.2, accent),
        part(0, 0.52, -0.05, 0.06, 0.12, 0.04, accent),
        part(0, 0.62, -0.06, tvW, tvW * 0.58, 0.05, accent, { shape: 'rounded', round: 0.01 }),
        decor(0, 0.65, -0.034, tvW - 0.05, tvW * 0.58 - 0.06, 0.004, '#22324a'),
      ];
    },
  },

  /** Торшер: тяжёлое основание, тонкая стойка, абажур. Абажур выше головы и твёрдый — в нём не спрячешься. */
  floorLamp: {
    color: '#f6e7c8',
    accent: '#2b2d42',
    length: 0.45,
    build: ({ color, accent, length }) => [
      part(0, 0, 0, 0.34, 0.04, 0.34, accent, { shape: 'cylinder' }),
      part(0, 0.04, 0, 0.04, 1.4, 0.04, accent, { shape: 'cylinder' }),
      part(0, 1.4, 0, length, 0.34, length, color, { shape: 'cylinder', surface: 'fabric' }),
    ],
  },

  /** Комод-буфет: три ряда ящиков с ручками. */
  sideboard: {
    color: '#e9d8b4',
    accent: '#8a5a35',
    length: 1.6,
    build: ({ color, accent, length }) => {
      const d = 0.45;
      const h = 0.82;
      const boxes: MapBox[] = [
        part(0, 0.08, 0, length, h - 0.08, d, color, { shape: 'rounded', round: 0.02, surface: 'wood' }),
        part(0, h, 0, length + 0.04, 0.03, d + 0.03, accent, { shape: 'rounded', round: 0.01, surface: 'wood' }),
        ...legs(length, d, 0.08, 0.06, 0.05, accent),
      ];
      const columns = Math.max(2, Math.round(length / 0.55));
      const cw = length / columns;
      for (let row = 0; row < 3; row++) {
        const y = 0.12 + row * 0.24;
        boxes.push(seam(0, y + 0.22, d / 2, length - 0.04, 0.006));
        for (let c = 0; c < columns; c++) boxes.push(handle(-length / 2 + cw * (c + 0.5), y + 0.11, d / 2));
      }
      for (let c = 1; c < columns; c++) boxes.push(seam(-length / 2 + cw * c, 0.1, d / 2, 0.006, h - 0.12));
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
      const panel = (x: number, y: number, z: number, w: number, ph: number, pd: number) =>
        decor(x, y, z, w, ph, pd, color, { surface: 'wood' });
      const boxes: MapBox[] = [
        collider(0, 0, 0, length, h, d),
        panel(0, 0, -d / 2 + 0.01, length, h, 0.02),
        panel(-length / 2 + wall / 2, 0, 0, wall, h, d),
        panel(length / 2 - wall / 2, 0, 0, wall, h, d),
      ];
      for (let i = 0; i <= shelves; i++) boxes.push(panel(0, i * step, 0, length - 2 * wall, wall, d));
      for (let i = 0; i < shelves; i++) {
        let x = -length / 2 + wall + 0.01;
        while (x < length / 2 - wall - 0.08) {
          const w = 0.03 + random() * 0.04;
          const bookHeight = (step - wall) * (0.55 + random() * 0.35);
          const bookColor = pick(BRIGHT, random);
          // Иногда пропуск — полка выглядит живой, а не забитой под линейку.
          if (random() > 0.12) boxes.push(decor(x + w / 2, i * step + wall, 0.02, w, bookHeight, d - 0.1, bookColor));
          x += w + 0.004;
        }
      }
      return boxes;
    },
  },

  /**
   * Растение в горшке. Листва твёрдая: сквозь неё раньше можно было пройти и встать внутри — тебя не видно
   * целиком, с любой стороны. Прятаться — за листвой и под её цвет, а не в ней.
   */
  plant: {
    color: '#52b788',
    accent: '#bc6c25',
    length: 0.5,
    build: ({ color, accent, length }) => [
      part(0, 0, 0, length * 0.7, 0.45, length * 0.7, accent, { shape: 'cylinder' }),
      part(0, 0.4, 0, length * 1.5, length * 1.7, length * 1.5, color, { shape: 'sphere', surface: 'carpet' }),
    ],
  },

  /** Высокое растение: большой горшок, ствол и несколько шапок листвы на разной высоте. */
  tallPlant: {
    color: '#2d6a4f',
    accent: '#e9edc9',
    length: 0.6,
    build: ({ color, accent, length }, random) => {
      const boxes: MapBox[] = [
        part(0, 0, 0, length * 0.75, 0.5, length * 0.75, accent, { shape: 'cylinder' }),
        decor(0, 0.5, 0, 0.05, 1.1, 0.05, '#6f4e37', { shape: 'cylinder' }),
      ];
      for (let i = 0; i < 4; i++) {
        const angle = random() * Math.PI * 2;
        const r = 0.12 + random() * 0.12;
        const size = 0.45 + random() * 0.2;
        boxes.push(
          part(Math.cos(angle) * r, 0.8 + i * 0.25, Math.sin(angle) * r, size, size * 0.8, size, color, {
            shape: 'sphere',
            surface: 'carpet',
          }),
        );
      }
      return boxes;
    },
  },

  /** Ковёр: тонкий, на него заходишь сам (ниже ступеньки). */
  rug: {
    color: '#c75b7a',
    accent: '#000000',
    length: 3,
    build: ({ color, length }) => [part(0, 0, 0, length, 0.025, length * 0.66, color, { surface: 'carpet', shape: 'rounded', round: 0.01 })],
  },
} satisfies Record<string, PropDef>;
