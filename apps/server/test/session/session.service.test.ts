import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECONNECT_GRACE_MS, SessionService } from '../../src/session/session.service';

describe('SessionService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives the same playerId when the session reconnects in time', () => {
    const sessions = new SessionService();
    const first = sessions.attach('secret', 's1');
    sessions.detach('secret', 's1');
    vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1000);
    const second = sessions.attach('secret', 's2');
    expect(second).toEqual({ playerId: first.playerId, resumed: true, replacedSocketId: null });
  });

  it('expires the session after the grace period', () => {
    const sessions = new SessionService();
    const expired: string[] = [];
    sessions.expired.subscribe((id) => expired.push(id));
    const { playerId } = sessions.attach('secret', 's1');
    sessions.detach('secret', 's1');
    vi.advanceTimersByTime(RECONNECT_GRACE_MS);
    expect(expired).toEqual([playerId]);
    expect(sessions.attach('secret', 's2').resumed).toBe(false);
  });

  it('ignores a late disconnect of an already replaced socket', () => {
    const sessions = new SessionService();
    sessions.attach('secret', 's1');
    const second = sessions.attach('secret', 's2'); // новая вкладка/переподключение раньше, чем отвалился старый
    expect(second.replacedSocketId).toBe('s1');
    sessions.detach('secret', 's1');
    expect(sessions.isConnected('secret')).toBe(true);
  });

  it('different sessions get different players', () => {
    const sessions = new SessionService();
    expect(sessions.attach('a', 's1').playerId).not.toBe(sessions.attach('b', 's2').playerId);
  });
});
