import { Injectable } from '@nestjs/common';
import { MAP_IDS, MAP_INFO, type MapId } from '@mecha/shared';
import { EventSink } from '../analytics/event-sink';

/** Бишкек живёт по UTC+6 круглый год (без перехода на летнее время): «день» игроков — по нему, не по UTC. */
const BISHKEK_OFFSET_MS = 6 * 3600_000;
const DAY_MS = 86_400_000;
/** Имя пояса для Postgres. Не '+06': в SQL это POSIX-запись, и она значит UTC−6. */
const TZ = 'Asia/Bishkek';
export const MAX_DAYS = 90;

export interface DayStats {
  day: string;
  /** Открыли игру (уникальные устройства). */
  visitors: number;
  /** Вошли в комнату — играли или хотя бы собирались. */
  players: number;
  /** Открыли игру впервые за всё время. */
  newPlayers: number;
  /** Новые комнаты (без пересозданных после перезапуска сервера). */
  rooms: number;
  /** Сыгранные раунды (дошедшие до итогов). */
  rounds: number;
}

export interface AdminStats {
  from: string;
  to: string;
  days: number;
  /** Итог за период: уникальные — за весь период, а не сумма дней (один игрок за неделю — один). */
  total: DayStats;
  daily: DayStats[];
  nicknames: { nickname: string; entries: number; devices: number; lastAt: string }[];
  maps: { map: string; name: string; rounds: number; hiderWins: number; seekerWins: number; avgSeconds: number; avgPlayers: number }[];
  results: { winner: string; reason: string; rounds: number }[];
  devices: { device: 'ios' | 'android' | 'desktop'; players: number }[];
}

/** Дата 'YYYY-MM-DD' по Бишкеку для момента времени. */
export function bishkekDay(ms: number): string {
  return new Date(ms + BISHKEK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Начало периода: полночь по Бишкеку `days − 1` дней назад (сегодня — первый из `days`). */
export function periodStart(now: number, days: number): Date {
  const today = Date.parse(`${bishkekDay(now)}T00:00:00Z`) - BISHKEK_OFFSET_MS;
  return new Date(today - (days - 1) * DAY_MS);
}

const EMPTY_DAY = { visitors: 0, players: 0, newPlayers: 0, rooms: 0, rounds: 0 };

/** Каждый день периода, и дни без игр — нулями: на графике пустой день виден, а не пропадает. */
export function fillDays(rows: readonly Partial<DayStats>[], from: Date, days: number): DayStats[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = bishkekDay(from.getTime() + i * DAY_MS);
    return { day, ...EMPTY_DAY, ...byDay.get(day) };
  });
}

/** Название карты по-русски; карта, которой больше нет в игре, — как есть. */
function mapName(id: string): string {
  return (MAP_IDS as readonly string[]).includes(id) ? MAP_INFO[id as MapId].name : id;
}

/**
 * Цифры для /stats/admin — SQL по таблице events. Все запросы берут начало периода параметром $1:
 * значения в текст запроса не вставляются никогда.
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly db: EventSink) {}

  get enabled(): boolean {
    return this.db.enabled;
  }

  async stats(days: number, now = Date.now()): Promise<AdminStats> {
    const from = periodStart(now, days);
    const [activity, fresh, nicknames, maps, results, devices] = await Promise.all([
      // GROUPING SETS: одним проходом — строка на каждый день и строка-итог (day = NULL) за весь период.
      this.db.query<Omit<DayStats, 'newPlayers'> & { day: string | null }>(
        `SELECT to_char((at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day,
           count(DISTINCT player) FILTER (WHERE type = 'player_seen')::int AS visitors,
           count(DISTINCT player) FILTER (WHERE type IN ('room_created', 'room_joined'))::int AS players,
           count(*) FILTER (WHERE type = 'room_created' AND (data->>'restored')::boolean IS NOT TRUE)::int AS rooms,
           count(*) FILTER (WHERE type = 'round_finished')::int AS rounds
         FROM events WHERE at >= $1
         GROUP BY GROUPING SETS ((1), ())`,
        [from],
      ),
      // Новый игрок — тот, кого впервые увидели в этот день за ВСЁ время, поэтому первое появление считаем по всей таблице.
      this.db.query<{ day: string | null; newPlayers: number }>(
        `SELECT to_char((first AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day, count(*)::int AS "newPlayers"
         FROM (SELECT min(at) AS first FROM events WHERE type = 'player_seen' GROUP BY player) f
         WHERE first >= $1
         GROUP BY GROUPING SETS ((1), ())`,
        [from],
      ),
      this.db.query<{ nickname: string; entries: number; devices: number; lastAt: Date }>(
        `SELECT data->>'nickname' AS nickname, count(*)::int AS entries,
           count(DISTINCT player)::int AS devices, max(at) AS "lastAt"
         FROM events WHERE type IN ('room_created', 'room_joined') AND at >= $1
         GROUP BY 1 ORDER BY "lastAt" DESC LIMIT 100`,
        [from],
      ),
      this.db.query<{ map: string; rounds: number; hiderWins: number; seekerWins: number; avgSeconds: number; avgPlayers: number }>(
        `SELECT data->>'map' AS map, count(*)::int AS rounds,
           count(*) FILTER (WHERE data->>'winner' = 'hider')::int AS "hiderWins",
           count(*) FILTER (WHERE data->>'winner' = 'seeker')::int AS "seekerWins",
           round(avg((data->>'seconds')::numeric))::int AS "avgSeconds",
           round(avg((data->>'players')::numeric), 1)::float AS "avgPlayers"
         FROM events WHERE type = 'round_finished' AND at >= $1
         GROUP BY 1 ORDER BY rounds DESC`,
        [from],
      ),
      this.db.query<{ winner: string; reason: string; rounds: number }>(
        `SELECT data->>'winner' AS winner, data->>'reason' AS reason, count(*)::int AS rounds
         FROM events WHERE type = 'round_finished' AND at >= $1
         GROUP BY 1, 2 ORDER BY rounds DESC`,
        [from],
      ),
      // iPad с iPadOS называет себя «Macintosh» — попадёт в компьютеры; для начала точности хватает.
      this.db.query<{ device: AdminStats['devices'][number]['device']; players: number }>(
        `SELECT CASE WHEN data->>'ua' ~* 'iphone|ipad' THEN 'ios'
                     WHEN data->>'ua' ~* 'android' THEN 'android'
                     ELSE 'desktop' END AS device,
           count(DISTINCT player)::int AS players
         FROM events WHERE type = 'player_seen' AND at >= $1
         GROUP BY 1 ORDER BY players DESC`,
        [from],
      ),
    ]);

    const freshByDay = new Map(fresh.map((r) => [r.day, r.newPlayers]));
    const rows = activity.map((r) => ({ ...r, newPlayers: freshByDay.get(r.day) ?? 0 }));
    const total = rows.find((r) => r.day === null);
    return {
      from: bishkekDay(from.getTime()),
      to: bishkekDay(now),
      days,
      total: { ...EMPTY_DAY, ...total, day: 'total' },
      daily: fillDays(
        rows.filter((r) => r.day !== null).map((r) => ({ ...r, day: r.day! })),
        from,
        days,
      ),
      nicknames: nicknames.map((n) => ({ ...n, lastAt: new Date(n.lastAt).toISOString() })),
      maps: maps.map((m) => ({ ...m, name: mapName(m.map) })),
      results,
      devices,
    };
  }
}
