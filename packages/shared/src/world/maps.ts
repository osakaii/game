import { ALA_TOO } from './ala-too/ala-too.js';
import { APARTMENT } from './apartment.js';
import { GARDEN } from './garden.js';
import { KITCHEN } from './kitchen.js';
import type { MapDef } from './map.js';
import { PLAYROOM } from './playroom.js';

/** Реестр карт. Порядок — порядок в списке выбора; первая — площадь Ала-Тоо (по умолчанию). */
export const MAP_IDS = ['ala-too', 'apartment', 'playroom', 'kitchen', 'garden'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const MAPS: Record<MapId, MapDef> = {
  'ala-too': ALA_TOO,
  apartment: APARTMENT,
  playroom: PLAYROOM,
  kitchen: KITCHEN,
  garden: GARDEN,
};
