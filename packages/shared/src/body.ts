import { z } from 'zod';

/** Зоны тела персонажа. Каждую зону прячущийся красит отдельно. */
export const BODY_ZONES = ['head', 'torso', 'armLeft', 'armRight', 'legLeft', 'legRight'] as const;
export type BodyZone = (typeof BODY_ZONES)[number];

/** Цвет каждой зоны в формате #rrggbb. */
export type BodyColors = Record<BodyZone, string>;

export const DEFAULT_BODY_COLOR = '#f2f2f2';

export function defaultBodyColors(): BodyColors {
  return fillColors(() => DEFAULT_BODY_COLOR);
}

/** Форма ищущих: красный верх, тёмный низ — прячущиеся сразу видят, кого бояться. */
export function seekerBodyColors(): BodyColors {
  return fillColors((zone) => (zone === 'legLeft' || zone === 'legRight' ? '#2b2d42' : '#d62828'));
}

function fillColors(colorOf: (zone: BodyZone) => string): BodyColors {
  return Object.fromEntries(BODY_ZONES.map((zone) => [zone, colorOf(zone)])) as BodyColors;
}

/** Строго #rrggbb в нижнем регистре: так цвета можно сравнивать как строки. */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #rrggbb')
  .transform((value) => value.toLowerCase());

export const PaintSchema = z.object({
  zones: z.array(z.enum(BODY_ZONES)).min(1).max(BODY_ZONES.length),
  color: HexColorSchema,
});
export type PaintPayload = z.input<typeof PaintSchema>;
