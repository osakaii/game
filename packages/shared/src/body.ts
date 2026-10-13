/** Зоны тела персонажа. Каждую зону прячущийся красит отдельно (этап 5). */
export const BODY_ZONES = ['head', 'torso', 'armLeft', 'armRight', 'legLeft', 'legRight'] as const;
export type BodyZone = (typeof BODY_ZONES)[number];

export const DEFAULT_BODY_COLOR = '#f2f2f2';
