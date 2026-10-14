/** Части тела персонажа. Каждая — коробка со своими гранями на атласе текстуры. */
export const BODY_ZONES = ['head', 'torso', 'armLeft', 'armRight', 'legLeft', 'legRight'] as const;
export type BodyZone = (typeof BODY_ZONES)[number];
