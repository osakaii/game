import { ALA_TOO } from './ala-too/ala-too.js';
import { APARTMENT } from './apartment.js';
import { GARDEN } from './garden.js';
import { KITCHEN } from './kitchen.js';
import type { MapDef } from './map.js';
import { PLAYROOM } from './playroom.js';
import { SUPERMARKET } from './supermarket/supermarket.js';

/** Реестр карт: все, которые сервер умеет загрузить (маленькие ранние — для тестов и проверок). */
export const MAP_IDS = ['ala-too', 'apartment', 'supermarket', 'playroom', 'kitchen', 'garden'] as const;
export type MapId = (typeof MAP_IDS)[number];

/**
 * Карты в списке выбора хоста, по порядку; первая — площадь Ала-Тоо (по умолчанию).
 * Детская, кухня и сад из первых версий остались в реестре: на них удобно проверять стрельбу и раунды.
 */
export const MAP_CHOICES: readonly MapId[] = ['ala-too', 'apartment', 'supermarket'];

export const MAPS: Record<MapId, MapDef> = {
  'ala-too': ALA_TOO,
  apartment: APARTMENT,
  supermarket: SUPERMARKET,
  playroom: PLAYROOM,
  kitchen: KITCHEN,
  garden: GARDEN,
};
