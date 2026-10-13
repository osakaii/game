import { z } from 'zod';
import { MAP_IDS } from './world/maps.js';

/** Варианты для интерфейса. Сервер принимает любые значения в пределах схемы. */
export const HIDE_SECONDS_OPTIONS = [20, 40, 60] as const;
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
});
export type RoomSettings = z.output<typeof RoomSettingsSchema>;

/** Хост меняет одно поле за раз — partial(): все поля необязательные. */
export const UpdateSettingsSchema = RoomSettingsSchema.partial();
export type UpdateSettingsPayload = z.input<typeof UpdateSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  mapId: 'playroom',
  hideSeconds: 40,
  seekSeconds: 150,
  seekers: 'auto',
  foundMode: 'helper',
};

/**
 * Очки. Прячущемуся выгодно дожить до конца, ищущему — находить.
 * Победа команды отдельно не награждается: очки и так отражают, кто как сыграл.
 */
export const SCORING = {
  hiderSurvived: 3,
  seekerFind: 2,
} as const;
