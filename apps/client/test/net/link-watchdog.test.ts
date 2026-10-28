import { describe, expect, it } from 'vitest';
import { DEAD_LINK_MS, LinkWatchdog } from '../../src/net/link-watchdog';

describe('LinkWatchdog', () => {
  it('a missed ping is fine, three in a row (silence longer than DEAD_LINK_MS) is a dead link', () => {
    const watchdog = new LinkWatchdog();
    watchdog.alive(1000);
    expect(watchdog.isDead(1000 + 2100)).toBe(false);
    expect(watchdog.isDead(1000 + DEAD_LINK_MS + 1)).toBe(true);
    watchdog.alive(9000);
    expect(watchdog.isDead(9500)).toBe(false);
  });
});
