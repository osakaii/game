import type { BodyZone } from '@mecha/shared';

/** Размер коробки части тела (м): ширина по X, высота по Y, глубина по Z. */
export interface PartSize {
  w: number;
  h: number;
  d: number;
}

/**
 * Форма персонажа — единственное место, где заданы размеры частей тела.
 * Модель строит по ним меши, атлас — выкройку текстуры. Поменяешь здесь — поменяется везде.
 */
export const CHARACTER_PARTS: Record<BodyZone, PartSize> = {
  head: { w: 0.42, h: 0.42, d: 0.42 },
  torso: { w: 0.56, h: 0.56, d: 0.32 },
  armLeft: { w: 0.18, h: 0.5, d: 0.2 },
  armRight: { w: 0.18, h: 0.5, d: 0.2 },
  legLeft: { w: 0.22, h: 0.6, d: 0.24 },
  legRight: { w: 0.22, h: 0.6, d: 0.24 },
};

/** Порядок частей фиксирован: индекс части хранится в карте позиций. */
export const PART_ORDER: readonly BodyZone[] = ['head', 'torso', 'armLeft', 'armRight', 'legLeft', 'legRight'];
