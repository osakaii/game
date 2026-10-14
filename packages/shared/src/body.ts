/**
 * Части тела персонажа. Каждая — скруглённая коробка со своими гранями на атласе текстуры
 * и своей костью скелета. Руки и ноги — из трёх частей (плечо, предплечье, кисть; бедро, голень, стопа):
 * суставы в локтях и коленях нужны для живых поз.
 *
 * Порядок важен: номер части хранится в карте позиций кожи и в индексах костей.
 */
export const BODY_ZONES = [
  'head',
  'torso',
  'upperArmLeft',
  'forearmLeft',
  'handLeft',
  'upperArmRight',
  'forearmRight',
  'handRight',
  'thighLeft',
  'shinLeft',
  'footLeft',
  'thighRight',
  'shinRight',
  'footRight',
] as const;
export type BodyZone = (typeof BODY_ZONES)[number];
