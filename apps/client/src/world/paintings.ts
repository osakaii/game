import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, type MapBox } from '@mecha/shared';
import type { SurfaceTexture } from './surfaces';

/** Размер одной картины на атласе (пикселей). Для холста ~1 м на телефоне этого хватает. */
const CELL = 128;

type Rgb = [number, number, number];
type Canvas = { set(x: number, y: number, c: Rgb): void };

const PALETTES: Rgb[][] = [
  [[38, 70, 83], [42, 157, 143], [233, 196, 106], [244, 162, 97], [231, 111, 81]],
  [[13, 27, 42], [27, 38, 59], [65, 90, 119], [119, 141, 169], [224, 225, 221]],
  [[255, 190, 11], [251, 86, 7], [255, 0, 110], [131, 56, 236], [58, 134, 255]],
  [[204, 213, 174], [233, 237, 201], [254, 250, 224], [250, 237, 205], [212, 163, 115]],
  [[0, 48, 73], [214, 40, 40], [247, 127, 0], [252, 191, 73], [234, 226, 183]],
];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Сюжеты картин — простые, но узнаваемые с расстояния: пейзаж, абстракция, «Мондриан», натюрморт.
 * Рисуем в своих координатах: (0,0) — левый нижний угол, y вверх (как в текстуре WebGL).
 */
const STYLES: ((c: Canvas, random: () => number, palette: Rgb[]) => void)[] = [
  // Пейзаж: небо-градиент, солнце, слои холмов, ближние темнее.
  (c, random, palette) => {
    const top = palette[1];
    const horizon = mix(palette[4], [255, 255, 255], 0.5);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) c.set(x, y, mix(horizon, top, y / CELL));
    const sx = 20 + random() * 88;
    const sy = 70 + random() * 40;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) if (Math.hypot(x - sx, y - sy) < 11) c.set(x, y, palette[3]);
    }
    for (let layer = 0; layer < 3; layer++) {
      const base = 60 - layer * 18;
      const freq = 0.03 + random() * 0.04;
      const phase = random() * 10;
      const color = mix(palette[2], palette[0], layer / 2);
      for (let x = 0; x < CELL; x++) {
        const h = base + Math.sin(x * freq + phase) * 10 + Math.sin(x * freq * 2.7 + phase) * 4;
        for (let y = 0; y < h; y++) c.set(x, y, color);
      }
    }
  },
  // Абстракция: фон и крупные круги и прямоугольники ярких цветов.
  (c, random, palette) => {
    const bg = mix(palette[4], [255, 255, 255], 0.6);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) c.set(x, y, bg);
    for (let i = 0; i < 7; i++) {
      const color = palette[Math.floor(random() * 4)];
      const cx = random() * CELL;
      const cy = random() * CELL;
      const r = 10 + random() * 26;
      const round = random() > 0.45;
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(CELL, cy + r); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(CELL, cx + r); x++) {
          if (!round || Math.hypot(x - cx, y - cy) < r) c.set(x, y, color);
        }
      }
    }
  },
  // «Мондриан»: белые поля, чёрная сетка, несколько ярких клеток.
  (c, random) => {
    const colors: Rgb[] = [[214, 40, 40], [0, 92, 175], [252, 191, 73], [245, 243, 236]];
    const xs = [0, 20 + Math.floor(random() * 30), 60 + Math.floor(random() * 30), CELL];
    const ys = [0, 30 + Math.floor(random() * 30), 75 + Math.floor(random() * 25), CELL];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const color = random() > 0.6 ? colors[Math.floor(random() * 3)] : colors[3];
        for (let y = ys[j]; y < ys[j + 1]; y++) for (let x = xs[i]; x < xs[i + 1]; x++) c.set(x, y, color);
      }
    }
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        if (xs.some((v) => Math.abs(x - v) < 2) || ys.some((v) => Math.abs(y - v) < 2)) c.set(x, y, [20, 20, 20]);
      }
    }
  },
  // Натюрморт: стена, стол, ваза и фрукты.
  (c, random, palette) => {
    const wall = mix(palette[0], [255, 255, 255], 0.35);
    const table = palette[4];
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) c.set(x, y, y < 40 ? table : wall);
    const vase = palette[1];
    for (let y = 36; y < 92; y++) {
      const half = 10 + Math.sin(((y - 36) / 56) * Math.PI) * 12;
      for (let x = Math.floor(52 - half); x < 52 + half; x++) c.set(x, y, vase);
    }
    for (let i = 0; i < 3; i++) {
      const cx = 78 + i * 13 + random() * 4;
      const cy = 46 + (i % 2) * 6;
      const color = palette[2 + (i % 3 === 2 ? 1 : i % 2)];
      for (let y = cy - 9; y < cy + 9; y++) for (let x = cx - 9; x < cx + 9; x++) if (Math.hypot(x - cx, y - cy) < 8) c.set(x, y, color);
    }
  },
];

/**
 * Все картины карты — в одной текстуре-атласе: каждая в своей клетке, один материал, один вызов отрисовки.
 * Возвращает сетку холстов (рамы — обычные блоки карты) или null, если картин нет.
 */
export function buildPaintings(boxes: MapBox[]): THREE.Mesh | null {
  if (boxes.length === 0) return null;
  const columns = Math.ceil(Math.sqrt(boxes.length));
  const size = columns * CELL;
  const pixels = new Uint8Array(size * size * 4);

  const parts = boxes.map((box, index) => {
    const cellX = (index % columns) * CELL;
    const cellY = Math.floor(index / columns) * CELL;
    const canvas: Canvas = {
      set: (x, y, [r, g, b]) => {
        const i = ((cellY + y) * size + cellX + x) * 4;
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = 255;
      },
    };
    const random = seededRandom(box.art ?? index);
    const palette = PALETTES[Math.floor(random() * PALETTES.length)];
    STYLES[Math.floor(random() * STYLES.length)](canvas, random, palette);
    return canvasGeometry(box, cellX / size, cellY / size, CELL / size);
  });

  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  // Пипетка читает пиксель из атласа так же, как из рисунка поверхности.
  const atlas: Pick<SurfaceTexture, 'pixels' | 'size' | 'texture'> = { pixels, size, texture };
  texture.userData.surface = atlas;

  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture }));
  mesh.receiveShadow = true;
  mesh.name = 'paintings';
  return mesh;
}

/**
 * Холст — тонкий блок. На его большие грани натягиваем клетку атласа целиком; ориентацию
 * берём по нормали, чтобы картина не была зеркальной ни на какой стене.
 */
function canvasGeometry(box: MapBox, u0: number, v0: number, span: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(box.w, box.h, box.d).toNonIndexed();
  geometry.translate(box.x, (box.y ?? 0) + box.h / 2, box.z);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const minX = box.x - box.w / 2;
  const minZ = box.z - box.d / 2;
  const minY = box.y ?? 0;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const nx = normal.getX(i);
    const nz = normal.getZ(i);
    const x = (position.getX(i) - minX) / box.w;
    const z = (position.getZ(i) - minZ) / box.d;
    // Смотрим на грань снаружи: «слева направо» для зрителя зависит от того, куда она обращена.
    let u = 0.5;
    if (nz > 0.5) u = x;
    else if (nz < -0.5) u = 1 - x;
    else if (nx > 0.5) u = 1 - z;
    else if (nx < -0.5) u = z;
    const v = (position.getY(i) - minY) / box.h;
    uv[i * 2] = u0 + Math.min(Math.max(u, 0.01), 0.99) * span;
    uv[i * 2 + 1] = v0 + Math.min(Math.max(v, 0.01), 0.99) * span;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
