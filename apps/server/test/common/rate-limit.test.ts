import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimit, RateLimitGuard } from '../../src/common/rate-limit';

class Handlers {
  @RateLimit(2, 3)
  limited() {}
  free() {}
}

function contextFor(handler: () => void, client: object, ack?: (result: unknown) => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getArgs: () => [client, {}, ack, 'event'].filter((arg) => arg !== undefined),
    switchToWs: () => ({ getClient: () => client }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows a burst, then blocks, then refills over time', () => {
    const guard = new RateLimitGuard(new Reflector());
    const client = { data: { playerId: 'p' } };
    const ctx = contextFor(Handlers.prototype.limited, client);

    expect([1, 2, 3, 4].map(() => guard.canActivate(ctx))).toEqual([true, true, true, false]);
    vi.advanceTimersByTime(500); // +1 жетон при 2/с
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('answers a waiting ack with RATE_LIMITED instead of leaving it hanging', () => {
    const guard = new RateLimitGuard(new Reflector());
    const client = { data: { playerId: 'p' } };
    const ack = vi.fn();
    for (let i = 0; i < 3; i++) guard.canActivate(contextFor(Handlers.prototype.limited, client));
    expect(guard.canActivate(contextFor(Handlers.prototype.limited, client, ack))).toBe(false);
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'RATE_LIMITED' });
  });

  it('does not limit handlers without the decorator', () => {
    const guard = new RateLimitGuard(new Reflector());
    const ctx = contextFor(Handlers.prototype.free, { data: {} });
    expect(Array.from({ length: 100 }, () => guard.canActivate(ctx)).every(Boolean)).toBe(true);
  });
});
