import { describe, expect, it } from 'vitest';
import { AdminStatsService, bishkekDay, fillDays, periodStart } from '../../src/admin/admin-stats.service';
import { EventSink } from '../../src/analytics/event-sink';

/** База-заглушка: отвечает на запрос по куску его текста и запоминает параметры. */
class FakeDb extends EventSink {
  readonly enabled = true;
  readonly params: unknown[][] = [];
  constructor(private readonly answers: [string, unknown[]][]) {
    super();
  }
  async write(): Promise<void> {}
  async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    this.params.push(values);
    return (this.answers.find(([part]) => text.includes(part))?.[1] ?? []) as T[];
  }
}

describe('Bishkek days', () => {
  it('a day starts at midnight in Bishkek (UTC+6), not in UTC', () => {
    expect(bishkekDay(Date.parse('2026-11-01T17:59:00Z'))).toBe('2026-11-01');
    expect(bishkekDay(Date.parse('2026-11-01T18:00:00Z'))).toBe('2026-11-02');
  });

  it('a 7-day period ends today and starts at Bishkek midnight six days ago', () => {
    const now = Date.parse('2026-11-02T03:00:00Z'); // 09:00 по Бишкеку
    expect(periodStart(now, 7).toISOString()).toBe('2026-10-26T18:00:00.000Z');
    expect(periodStart(now, 1).toISOString()).toBe('2026-11-01T18:00:00.000Z');
  });

  it('days without games are zeros, so the chart shows the gap', () => {
    const from = periodStart(Date.parse('2026-11-02T03:00:00Z'), 3);
    expect(fillDays([{ day: '2026-11-01', players: 4, rounds: 2 }], from, 3)).toEqual([
      { day: '2026-10-31', visitors: 0, players: 0, newPlayers: 0, rooms: 0, rounds: 0 },
      { day: '2026-11-01', visitors: 0, players: 4, newPlayers: 0, rooms: 0, rounds: 2 },
      { day: '2026-11-02', visitors: 0, players: 0, newPlayers: 0, rooms: 0, rounds: 0 },
    ]);
  });
});

describe('AdminStatsService', () => {
  it('merges daily rows with the period total, new players and map names', async () => {
    const db = new FakeDb([
      [
        "count(*) FILTER (WHERE type = 'round_finished')",
        [
          { day: '2026-11-02', visitors: 5, players: 3, rooms: 1, rounds: 2 },
          { day: null, visitors: 9, players: 6, rooms: 3, rounds: 5 },
        ],
      ],
      ['AS "newPlayers"', [{ day: '2026-11-02', newPlayers: 2 }, { day: null, newPlayers: 4 }]],
      [
        'AS "hiderWins"',
        [
          { map: 'castle', rounds: 3, hiderWins: 2, seekerWins: 1, avgSeconds: 200, avgPlayers: 4.5 },
          { map: 'old-map', rounds: 1, hiderWins: 1, seekerWins: 0, avgSeconds: 90, avgPlayers: 2 },
        ],
      ],
      ['AS "lastAt"', [{ nickname: 'Аня', entries: 3, devices: 1, lastAt: new Date('2026-11-02T02:00:00Z') }]],
    ]);
    const stats = await new AdminStatsService(db).stats(2, Date.parse('2026-11-02T03:00:00Z'));

    expect(stats).toMatchObject({ from: '2026-11-01', to: '2026-11-02', days: 2 });
    expect(stats.total).toEqual({ day: 'total', visitors: 9, players: 6, newPlayers: 4, rooms: 3, rounds: 5 });
    expect(stats.daily).toEqual([
      { day: '2026-11-01', visitors: 0, players: 0, newPlayers: 0, rooms: 0, rounds: 0 },
      { day: '2026-11-02', visitors: 5, players: 3, newPlayers: 2, rooms: 1, rounds: 2 },
    ]);
    expect(stats.maps.map((m) => m.name)).toEqual(['Замок', 'old-map']);
    expect(stats.nicknames).toEqual([{ nickname: 'Аня', entries: 3, devices: 1, lastAt: '2026-11-02T02:00:00.000Z' }]);
    // Начало периода — параметром каждого запроса, не текстом.
    expect(db.params.every((p) => p.length === 1 && (p[0] as Date).toISOString() === '2026-10-31T18:00:00.000Z')).toBe(true);
  });
});
