import type { BodyZone } from './body.js';

/** Кожа персонажа — квадратная текстура SKIN_SIZE × SKIN_SIZE (атлас см. на клиенте). */
export const SKIN_SIZE = 512;
/** Предел размера картинки кожи. Сжатая WebP обычно 30–120 КБ; запас — на PNG у Safari. */
export const MAX_SKIN_BYTES = 400 * 1024;

/**
 * Основа кожи — с чего начинается раскраска. Картинку основы не передаём по сети:
 * каждый клиент рисует её сам по этому слову.
 */
export type SkinBase = 'default' | 'seeker';

const BASE_COLORS: Record<SkinBase, (part: BodyZone) => string> = {
  default: () => '#f2f2f2',
  // Форма ищущих: красный верх, тёмный низ — прячущиеся сразу видят, кого бояться.
  seeker: (part) => (part === 'legLeft' || part === 'legRight' ? '#2b2d42' : '#d62828'),
};

export function skinBaseColor(base: SkinBase, part: BodyZone): string {
  return BASE_COLORS[base](part);
}

/** Что известно о коже игрока в room:state. Саму картинку присылают отдельным событием. */
export interface SkinState {
  base: SkinBase;
  /** Растёт при каждой загрузке картинки и при каждом сбросе — по нему клиент понимает, что устарело. */
  revision: number;
  /** false — кожа равна основе, картинки нет. */
  hasImage: boolean;
}

/** Сервер -> клиент: новая кожа игрока. image — сжатая картинка (WebP или PNG). */
export interface SkinImageEvent {
  playerId: string;
  revision: number;
  image: ArrayBuffer | Uint8Array;
}

export interface SkinImageInfo {
  format: 'webp' | 'png';
  width: number;
  height: number;
}

/**
 * Определить формат и размер картинки по её байтам.
 *
 * Клиенту верить нельзя: под видом картинки могут прислать что угодно. Поэтому смотрим
 * на «магические байты» — сигнатуру в начале файла, — и на размер из заголовка формата.
 * Целиком картинку сервер не декодирует: это дорого и само по себе источник уязвимостей.
 */
export function detectSkinImage(bytes: Uint8Array): SkinImageInfo | null {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  const u16le = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const u24le = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
  const u32be = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;

  // PNG: 8 байт сигнатуры, затем первый блок IHDR, в нём ширина и высота (big-endian).
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b) && ascii(12, 4) === 'IHDR') {
    return { format: 'png', width: u32be(16), height: u32be(20) };
  }

  // WebP: контейнер RIFF, внутри один из трёх видов заголовка.
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { format: 'webp', width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { format: 'webp', width: u24le(24) + 1, height: u24le(27) + 1 };
    }
  }
  return null;
}
