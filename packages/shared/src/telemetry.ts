import { z } from 'zod';
import { MAP_IDS } from './world/catalog.js';
import { ROOM_PHASES } from './game.js';

/**
 * Телеметрия: как игра работает на телефонах игроков.
 *
 * Мы не видим их экраны — FPS, видеокарту, ошибки JS узнаём только из этих отчётов. Клиент шлёт
 * намерение «вот мои замеры», сервер проверяет формат этой схемой и пишет в лог; ни на что в игре
 * отчёты не влияют, поэтому соврать в них можно только себе.
 *
 * Личных данных здесь нет: ни ника, ни IP. Строки обрезаны по длине — лог не раздуть мусором.
 */

/** Как часто клиент присылает замеры производительности. */
export const TELEMETRY_INTERVAL_SEC = 30;
/** Отчёт по меньшему числу секунд не показателен (загрузка, свернули вкладку). */
export const TELEMETRY_MIN_SEC = 10;
/** Больше ошибок за сессию не шлём: сломанный цикл кадров отправил бы тысячи одинаковых. */
export const TELEMETRY_MAX_ERRORS = 5;

const text = (max: number) => z.string().max(max);

export const DeviceInfoSchema = z.object({
  /** User-Agent браузера: модель телефона, ОС, браузер. */
  ua: text(300),
  /** Видеокарта (WEBGL_debug_renderer_info). Пусто, если браузер не говорит. */
  gpu: text(200),
  dpr: z.number().min(0.5).max(6),
  screenW: z.number().int().min(0).max(10_000),
  screenH: z.number().int().min(0).max(10_000),
  /** Ядра процессора и память (ГБ) — есть не во всех браузерах. */
  cores: z.number().int().min(0).max(256).nullable(),
  memoryGb: z.number().min(0).max(64).nullable(),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

export const PerfReportSchema = z.object({
  kind: z.literal('perf'),
  /** Средний FPS за период. */
  fps: z.number().min(0).max(1000),
  /** «Просадки»: FPS по 5% самых медленных кадров — их игрок и замечает как рывки. */
  lowFps: z.number().min(0).max(1000),
  /** За сколько секунд замер. */
  seconds: z.number().min(0).max(600),
  /** Уровень автокачества: 2 — всё, 1 — без теней, 0 — ещё и лёгкая краска и 1× разрешение. */
  quality: z.number().int().min(0).max(2),
  renderScale: z.number().min(0.25).max(6),
  /** Мокрая краска в 8 бит — у телефона нет half-float (слабая видеокарта). */
  wet8bit: z.boolean(),
  drawCalls: z.number().int().min(0).max(100_000),
  triangles: z.number().int().min(0).max(100_000_000),
  mapId: z.enum(MAP_IDS),
  phase: z.enum(ROOM_PHASES),
  device: DeviceInfoSchema,
});
export type PerfReport = z.infer<typeof PerfReportSchema>;

export const ErrorReportSchema = z.object({
  kind: z.literal('error'),
  message: text(500),
  /** Файл:строка:колонка, где упало. */
  source: text(300),
  stack: text(2000),
  version: text(32),
});
export type ErrorReport = z.infer<typeof ErrorReportSchema>;

export const ClientReportSchema = z.discriminatedUnion('kind', [PerfReportSchema, ErrorReportSchema]);
export type ClientReport = z.infer<typeof ClientReportSchema>;

/** Обрезать строку под лимит схемы, а не потерять весь отчёт из-за длинного User-Agent. */
export function clip(value: string | undefined | null, max: number): string {
  return (value ?? '').slice(0, max);
}
