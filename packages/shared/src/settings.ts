import { z } from 'zod';
import { MAP_IDS, MAP_INFO, type MapId } from './world/catalog.js';

/** Варианты для интерфейса. Сервер принимает любые значения в пределах схемы. */
/** Свободная покраска кистью дольше, чем тык в зоны, — поэтому на прятки больше времени. */
export const HIDE_SECONDS_OPTIONS = [40, 60, 90] as const;
export const SEEK_SECONDS_OPTIONS = [90, 150, 240] as const;
export const SEEKER_OPTIONS = ['auto', 1, 2, 3] as const;
export const FOUND_MODE_OPTIONS = ['helper', 'ghost'] as const;

export const RoomSettingsSchema = z.object({
  mapId: z.enum(MAP_IDS),
  hideSeconds: z.number().int().min(10).max(120),
  seekSeconds: z.number().int().min(30).max(600),
  /** 'auto' — по числу игроков (seekerCount). Иначе ровно столько, но всегда меньше игроков. */
  seekers: z.union([z.literal('auto'), z.number().int().min(1).max(3)]),
  /** Что происходит с найденным: становится помощником ищущих или призраком-наблюдателем. */
  foundMode: z.enum(['helper', 'ghost']),
  /** Подсказки: во второй половине поиска прячущиеся свистят со своих мест (hints.ts). */
  hints: z.boolean(),
});
export type RoomSettings = z.output<typeof RoomSettingsSchema>;

/** Хост меняет одно поле за раз — partial(): все поля необязательные. */
export const UpdateSettingsSchema = RoomSettingsSchema.partial();
export type UpdateSettingsPayload = z.input<typeof UpdateSettingsSchema>;

/** Время поиска, если у карты нет своего. */
const SEEK_SECONDS = 150;

/** Время поиска по умолчанию для карты: своё у большой площади, общее у остальных. */
export function defaultSeekSeconds(mapId: MapId): number {
  return MAP_INFO[mapId].seekSeconds ?? SEEK_SECONDS;
}

/**
 * Применить правку настроек. Сменили карту, а время поиска не указали — берём время этой карты:
 * хост, выбравший площадь, получает 4 минуты сам, без похода в соседний список.
 */
export function patchSettings(settings: RoomSettings, patch: Partial<RoomSettings>): RoomSettings {
  const next = { ...settings, ...patch };
  if (patch.mapId !== undefined && patch.mapId !== settings.mapId && patch.seekSeconds === undefined) {
    next.seekSeconds = defaultSeekSeconds(next.mapId);
  }
  return next;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  mapId: 'ala-too',
  hideSeconds: 60,
  seekSeconds: defaultSeekSeconds('ala-too'),
  seekers: 'auto',
  foundMode: 'helper',
  // На большой площади без подсказок раунд часто кончается ничем — включены по умолчанию.
  hints: true,
};

/**
 * Очки. Прячущемуся выгодно дожить до конца, ищущему — находить.
 * Победа команды отдельно не награждается: очки и так отражают, кто как сыграл.
 */
export const SCORING = {
  hiderSurvived: 3,
  seekerFind: 2,
} as const;
