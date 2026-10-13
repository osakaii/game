import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GameSocket } from './socket-types';

const RATE_LIMIT_KEY = 'rateLimit';

interface RateLimitOptions {
  /** Сколько событий в секунду в среднем. */
  perSecond: number;
  /** Сколько можно отправить разом, «пачкой». */
  burst: number;
}

/**
 * Декоратор: вешает на обработчик метаданные с лимитом.
 * Сам ничего не проверяет — проверяет RateLimitGuard, читая эти метаданные через Reflector.
 */
export const RateLimit = (perSecond: number, burst = perSecond) =>
  SetMetadata(RATE_LIMIT_KEY, { perSecond, burst } satisfies RateLimitOptions);

/**
 * Guard — «вахтёр» перед обработчиком: вернул false, и обработчик не вызывается.
 *
 * Алгоритм — token bucket (ведро с жетонами). В ведре до burst жетонов, они пополняются
 * со скоростью perSecond. Каждое событие забирает жетон. Пусто — событие отбрасывается.
 * Так разрешены короткие всплески (двойной тап), но не длительный поток.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const limit = this.reflector.get<RateLimitOptions | undefined>(RATE_LIMIT_KEY, context.getHandler());
    if (!limit) return true;

    const client = context.switchToWs().getClient<GameSocket>();
    const key = context.getHandler().name;
    const buckets = (client.data.rateBuckets ??= {});
    const now = Date.now();
    const bucket = (buckets[key] ??= { tokens: limit.burst, updatedAt: now });

    bucket.tokens = Math.min(limit.burst, bucket.tokens + ((now - bucket.updatedAt) / 1000) * limit.perSecond);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.logger.warn(`rate limit: ${client.data.playerId} on ${key}`);
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }
}
