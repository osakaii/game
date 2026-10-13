import { GARDEN } from './garden.js';
import { KITCHEN } from './kitchen.js';
import type { MapDef } from './map.js';
import { PLAYROOM } from './playroom.js';

/** Реестр карт. Порядок — порядок в списке выбора. */
export const MAP_IDS = ['playroom', 'kitchen', 'garden'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MAPS: Record<MapId, MapDef> = {
  playroom: PLAYROOM,
  kitchen: KITCHEN,
  garden: GARDEN,
};
