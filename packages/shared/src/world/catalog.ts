import type { MapDef } from './map.js';

/** Реестр карт: все, которые сервер умеет загрузить (маленькие ранние — для тестов и проверок). */
export const MAP_IDS = ['ala-too', 'apartment', 'supermarket', 'restaurant', 'courtyard', 'castle', 'playroom', 'kitchen', 'garden'] as const;
export type MapId = (typeof MAP_IDS)[number];

/**
 * Карты в списке выбора хоста, по порядку; первая — площадь Ала-Тоо (по умолчанию).
 * Детская, кухня и сад из первых версий остались в реестре: на них удобно проверять стрельбу и раунды.
 */
export const MAP_CHOICES: readonly MapId[] = ['ala-too', 'apartment', 'supermarket', 'restaurant', 'courtyard', 'castle'];

/** Что известно о карте без её построения: для списка выбора и настроек. Тест сверяет с самими картами. */
export interface MapInfo {
  name: string;
  /** Время поиска по умолчанию, с (см. `MapDef.seekSeconds`). */
  seekSeconds?: number;
}

export const MAP_INFO: Record<MapId, MapInfo> = {
  'ala-too': { name: 'Площадь Ала-Тоо', seekSeconds: 240 },
  apartment: { name: 'Квартира' },
  supermarket: { name: 'Супермаркет', seekSeconds: 300 },
  restaurant: { name: 'Ресторан', seekSeconds: 300 },
  courtyard: { name: 'Двор', seekSeconds: 300 },
  castle: { name: 'Замок', seekSeconds: 300 },
  playroom: { name: 'Детская' },
  kitchen: { name: 'Кухня' },
  garden: { name: 'Сад' },
};

/**
 * Каждая карта — отдельный модуль, его грузят только когда он нужен. В браузере сборщик кладёт
 * каждую карту в свой файл: телефон качает и строит одну карту комнаты, а не все сразу.
 */
const LOADERS: Record<MapId, () => Promise<MapDef>> = {
  'ala-too': () => import('./ala-too/ala-too.js').then((m) => m.ALA_TOO),
  apartment: () => import('./apartment.js').then((m) => m.APARTMENT),
  supermarket: () => import('./supermarket/supermarket.js').then((m) => m.SUPERMARKET),
  restaurant: () => import('./restaurant.js').then((m) => m.RESTAURANT),
  courtyard: () => import('./courtyard.js').then((m) => m.COURTYARD),
  castle: () => import('./castle.js').then((m) => m.CASTLE),
  playroom: () => import('./playroom.js').then((m) => m.PLAYROOM),
  kitchen: () => import('./kitchen.js').then((m) => m.KITCHEN),
  garden: () => import('./garden.js').then((m) => m.GARDEN),
};

const loading = new Map<MapId, Promise<MapDef>>();

/** Загрузить карту (один раз: повторный вызов вернёт ту же). Не загрузилась — следующий вызов попробует снова. */
export function loadMap(id: MapId): Promise<MapDef> {
  let map = loading.get(id);
  if (!map) {
    map = LOADERS[id]();
    map.catch(() => loading.delete(id));
    loading.set(id, map);
  }
  return map;
}
