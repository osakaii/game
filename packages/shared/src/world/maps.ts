import { ALA_TOO } from './ala-too/ala-too.js';
import { APARTMENT } from './apartment.js';
import { CASTLE } from './castle.js';
import type { MapId } from './catalog.js';
import { COURTYARD } from './courtyard.js';
import { GARDEN } from './garden.js';
import { KITCHEN } from './kitchen.js';
import type { MapDef } from './map.js';
import { PLAYROOM } from './playroom.js';
import { RESTAURANT } from './restaurant.js';
import { SUPERMARKET } from './supermarket/supermarket.js';

/**
 * Все карты сразу, синхронно — для сервера и тестов (`@mecha/shared/maps`). Браузер сюда не ходит:
 * он грузит одну нужную карту через `loadMap` (catalog.ts), иначе каждый телефон строил бы все девять.
 */
export const MAPS: Record<MapId, MapDef> = {
  'ala-too': ALA_TOO,
  apartment: APARTMENT,
  supermarket: SUPERMARKET,
  restaurant: RESTAURANT,
  courtyard: COURTYARD,
  castle: CASTLE,
  playroom: PLAYROOM,
  kitchen: KITCHEN,
  garden: GARDEN,
};

export * from './ala-too/ala-too.js';
export * from './apartment.js';
export * from './castle.js';
export * from './courtyard.js';
export * from './garden.js';
export * from './kitchen.js';
export * from './playroom.js';
export * from './restaurant.js';
export * from './supermarket/supermarket.js';
