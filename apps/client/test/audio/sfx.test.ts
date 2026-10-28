// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Поддельный AudioContext: только то, что трогает Sfx при разблокировке. */
class FakeContext {
  static last: FakeContext | null = null;
  state: string = 'suspended';
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  constructor() {
    FakeContext.last = this;
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => {} };
  }
}

describe('Sfx unlock on phones', () => {
  beforeEach(() => {
    FakeContext.last = null;
    vi.stubGlobal('AudioContext', FakeContext);
  });

  it('a finger lifting off (touchend) unlocks sound — pointerdown alone is not enough for Safari', async () => {
    const { Sfx } = await import('../../src/audio/sfx');
    new Sfx();
    window.dispatchEvent(new Event('touchend'));
    expect(FakeContext.last?.resume).toHaveBeenCalled();
  });

  it('resumes after a phone call (Safari "interrupted"), not only from "suspended"', async () => {
    const { Sfx } = await import('../../src/audio/sfx');
    new Sfx();
    window.dispatchEvent(new Event('pointerup'));
    const ctx = FakeContext.last!;
    ctx.state = 'interrupted';
    ctx.resume.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('asks iPhone to play like a video (ignore the silent switch) and gives music back when muted', async () => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
    const { Sfx } = await import('../../src/audio/sfx');
    const sfx = new Sfx();
    sfx.muted = false;
    window.dispatchEvent(new Event('click'));
    expect(session.type).toBe('playback');
    sfx.setMuted(true);
    expect(session.type).toBe('ambient');
    sfx.setMuted(false);
  });
});
