import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BUILD_INFO } from '../common/build-info';
import { EventSink, type AnalyticsEvent, type StoredEvent } from './event-sink';

/** Раз в сколько отправлять накопленное. Игра не ждёт базу: событие только кладётся в очередь. */
export const FLUSH_INTERVAL_MS = 10_000;
/** Больше одного запроса не шлём: при вечере игры это сотни событий, не тысячи. */
export const MAX_BATCH = 500;
/** База лежит долго — копим не больше этого, дальше старые события теряются. Это статистика, не платежи. */
export const MAX_QUEUE = 5_000;

/**
 * Постоянный ключ игрока для статистики: хэш sessionId. Сам sessionId — секрет (по нему входят в сессию),
 * в базу его класть нельзя; хэш назад не развернуть, но у одного браузера он всегда один и тот же —
 * так считаются уникальные игроки, даже когда сервер перезапустился и выдал новый playerId.
 */
export function playerKey(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('base64url').slice(0, 16);
}

/**
 * Статистика игры: игровой код вызывает `track`, события копятся в памяти и раз в 10 с уходят
 * в базу одной пачкой. База недоступна — пачка возвращается в очередь, игра об этом не узнаёт.
 */
@Injectable()
export class AnalyticsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Analytics');
  private queue: StoredEvent[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private flushing: Promise<void> | null = null;
  /** Сколько событий выкинули из переполненной очереди с последней удачной записи. */
  private dropped = 0;
  /** Ошибку базы пишем в лог один раз, а не каждые 10 с, пока она лежит. */
  private failing = false;

  constructor(private readonly sink: EventSink) {}

  onModuleInit() {
    if (!this.sink.enabled) {
      this.logger.log('статистика выключена: нет DATABASE_URL');
      return;
    }
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // Таймер не держит процесс живым: остановке сервера он не мешает.
    this.timer.unref();
  }

  /** SIGTERM (деплой, перезапуск): дописать остаток, иначе последние 10 с пропадут. */
  async onApplicationShutdown() {
    clearInterval(this.timer);
    if (!this.sink.enabled) return;
    await this.flush();
    await this.sink.close();
  }

  track(event: AnalyticsEvent, now = Date.now()): void {
    if (!this.sink.enabled) return;
    this.queue.push({ ...event, at: new Date(now), version: BUILD_INFO.version });
    if (this.queue.length > MAX_QUEUE) {
      this.queue.shift();
      this.dropped++;
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Отправить очередь. Пока идёт прошлая отправка — ждём её, а не шлём те же события второй раз. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async drain() {
    while (this.queue.length) {
      const batch = this.queue.splice(0, MAX_BATCH);
      try {
        await this.sink.write(batch);
      } catch (error) {
        // Вернуть в начало очереди, но не раздуть её сверх лимита: новые события важнее старых.
        const room = Math.max(0, MAX_QUEUE - this.queue.length);
        this.dropped += batch.length - Math.min(batch.length, room);
        this.queue.unshift(...batch.slice(batch.length - room));
        if (!this.failing) this.logger.warn(`база недоступна, события ждут: ${describe(error)}`);
        this.failing = true;
        return;
      }
      if (this.failing || this.dropped) {
        this.logger.log(`запись в базу восстановлена${this.dropped ? `, потеряно событий: ${this.dropped}` : ''}`);
      }
      this.failing = false;
      this.dropped = 0;
    }
  }
}

/** У отказа соединения (ECONNREFUSED) пустой message — тогда хотя бы код ошибки. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message || (error as NodeJS.ErrnoException).code || error.name;
}
