import { HttpException, NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminKeyGuard, FAILURE_WINDOW_MS, MAX_FAILURES, keyMatches } from '../../src/admin/admin-key.guard';

const KEY = 'correct-horse-battery-staple';

function context(key?: string): ExecutionContext {
  const request = { header: (name: string) => (name === 'x-admin-key' ? key : undefined) };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('AdminKeyGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('ADMIN_KEY', KEY);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('lets the right key in, refuses a wrong or missing one', () => {
    const guard = new AdminKeyGuard();
    expect(guard.canActivate(context(KEY))).toBe(true);
    expect(() => guard.canActivate(context('wrong'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('without ADMIN_KEY on the server the section does not exist', () => {
    vi.stubEnv('ADMIN_KEY', '');
    expect(() => new AdminKeyGuard().canActivate(context(''))).toThrow(NotFoundException);
  });

  it('after too many wrong keys refuses even the right one for a while: guessing is pointless', () => {
    const guard = new AdminKeyGuard();
    for (let i = 0; i < MAX_FAILURES; i++) expect(() => guard.canActivate(context(`guess-${i}`))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context(KEY))).toThrow(HttpException);
    try {
      guard.canActivate(context(KEY));
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
    }
    vi.advanceTimersByTime(FAILURE_WINDOW_MS);
    expect(guard.canActivate(context(KEY))).toBe(true);
  });

  it('compares keys of any length without throwing', () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches('short', KEY)).toBe(false);
    expect(keyMatches(KEY + 'x'.repeat(500), KEY)).toBe(false);
    expect(keyMatches(undefined, KEY)).toBe(false);
  });
});
