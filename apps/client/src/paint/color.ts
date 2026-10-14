/**
 * Математика цвета для палитры. Чистые функции — без DOM и three.js.
 *
 * HSV — для человека: оттенок (h, 0..360), насыщенность (s, 0..1), яркость (v, 0..1).
 * RGB — для экрана: 0..255. OKLab — для сравнения: расстояние в нём совпадает с тем,
 * как глаз различает цвета (в RGB два одинаково «далёких» числами цвета могут выглядеть
 * почти одинаковыми или совсем разными).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const delta = max - Math.min(R, G, B);
  let h = 0;
  if (delta > 0) {
    if (max === R) h = 60 * (((G - B) / delta) % 6);
    else if (max === G) h = 60 * ((B - R) / delta + 2);
    else h = 60 * ((R - G) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

/** sRGB (как в #hex) -> линейный свет. Экран хранит цвет «с гаммой», считать надо в линейном. */
function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** OKLab (Björn Ottosson, 2020): L — светлота, a — зелёный↔красный, b — синий↔жёлтый. */
export function rgbToOklab({ r, g, b }: Rgb): { L: number; a: number; b: number } {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Насколько различаются цвета для глаза: 0 — одинаковые, ~0.02 — едва заметно, >0.1 — явно разные. */
export function colorDistance(a: Rgb, b: Rgb): number {
  const x = rgbToOklab(a);
  const y = rgbToOklab(b);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

export type MatchLevel = 'perfect' | 'close' | 'noticeable' | 'far';

export function matchLevel(distance: number): MatchLevel {
  if (distance < 0.02) return 'perfect';
  if (distance < 0.05) return 'close';
  if (distance < 0.1) return 'noticeable';
  return 'far';
}

/** Точка на квадрате насыщенности/яркости (0..1 по обеим осям, y вниз) -> s и v. */
export function squareToSv(x: number, y: number): { s: number; v: number } {
  return { s: clamp01(x), v: 1 - clamp01(y) };
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
