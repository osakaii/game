import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { EventSink, type StoredEvent } from './event-sink';

/**
 * Одна таблица на все события. Подробности — в `data` (JSONB): новое событие или поле
 * не требует миграции. Индексы — под вопросы статистики: «события типа X за период», «история игрока».
 * IF NOT EXISTS — сервер сам создаёт таблицу при первой записи, отдельного шага миграции нет.
 */
export const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL,
  type text NOT NULL,
  player text,
  room text,
  version text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_type_at ON events (type, at);
CREATE INDEX IF NOT EXISTS events_player_at ON events (player, at);
`;

/**
 * Вся пачка — одним запросом с шестью параметрами-массивами: unnest разворачивает их в строки.
 * Не собираем SQL из значений: ник игрока попадает в базу только параметром, инъекция невозможна.
 */
export function insertQuery(events: readonly StoredEvent[]): { text: string; values: unknown[] } {
  return {
    text:
      'INSERT INTO events (at, type, player, room, version, data) ' +
      'SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[])',
    values: [
      events.map((e) => e.at),
      events.map((e) => e.type),
      events.map((e) => e.player ?? null),
      events.map((e) => e.room ?? null),
      events.map((e) => e.version),
      events.map((e) => JSON.stringify(e.data ?? {})),
    ],
  };
}

/** Postgres (Neon). Строка подключения — из DATABASE_URL, в ней же `sslmode=require`. */
export class PgSink extends EventSink {
  readonly enabled = true;
  private readonly logger = new Logger('Analytics');
  private readonly pool: Pool;
  private ready: Promise<unknown> | null = null;

  constructor(connectionString: string) {
    super();
    this.pool = new Pool({
      connectionString,
      // Пишем раз в 10 с одной пачкой — двух соединений с запасом.
      max: 2,
      // Neon усыпляет базу без запросов; соединение держать незачем.
      idleTimeoutMillis: 30_000,
      // Без таймаутов зависший запрос держал бы очередь вечно.
      connectionTimeoutMillis: 10_000,
      query_timeout: 15_000,
    });
    // Обрыв простаивающего соединения (база уснула, сеть) — событие пула. Без обработчика Node уронил бы весь сервер.
    this.pool.on('error', (error) => this.logger.warn(`pool: ${error.message}`));
  }

  async write(events: readonly StoredEvent[]): Promise<void> {
    // Таблицу создаём один раз; не вышло (база недоступна) — попробуем со следующей пачкой.
    this.ready ??= this.pool.query(CREATE_TABLE_SQL).catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    await this.ready;
    await this.pool.query(insertQuery(events));
  }

  async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(text, values);
    return result.rows as T[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
