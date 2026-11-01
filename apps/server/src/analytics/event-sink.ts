/** Что сервер записывает в статистику. Новый тип — просто новое имя: схема базы не меняется. */
export type EventType = 'player_seen' | 'room_created' | 'room_joined' | 'round_started' | 'round_finished';

/** Событие, как его передаёт игровой код: что случилось, с кем и где. */
export interface AnalyticsEvent {
  type: EventType;
  /** Постоянный ключ игрока (`playerKey`), не playerId: тот меняется после перезапуска сервера. */
  player?: string;
  /** Код комнаты. */
  room?: string;
  /** Подробности события (карта, ник, победитель…) — в базе это JSONB. */
  data?: Record<string, unknown>;
}

/** Событие в очереди: плюс время и версия сервера, на которой оно случилось. */
export interface StoredEvent extends AnalyticsEvent {
  at: Date;
  version: string;
}

/**
 * Куда уходят события. Абстрактный класс, а не интерфейс: Nest внедряет зависимость по значению,
 * а интерфейса в рантайме нет. Тесты подставляют свою реализацию, без базы.
 */
export abstract class EventSink {
  /** false — базы нет (локально, в CI): события даже не копятся. */
  abstract readonly enabled: boolean;
  /** Записать пачку. Бросает, если база недоступна, — очередь попробует ещё раз. */
  abstract write(events: readonly StoredEvent[]): Promise<void>;
  async close(): Promise<void> {}
}

/** Без DATABASE_URL: статистика выключена, игра работает как раньше. */
export class NullSink extends EventSink {
  readonly enabled = false;
  async write(): Promise<void> {}
}
