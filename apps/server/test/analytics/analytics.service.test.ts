import { Logger } from '@nestjs/common';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@mecha/shared';
import { AnalyticsService, FLUSH_INTERVAL_MS, MAX_BATCH, MAX_QUEUE, playerKey } from '../../src/analytics/analytics.service';
import { NullSink } from '../../src/analytics/event-sink';
import { RecordingSink } from './recording-sink';

function setup() {
  const sink = new RecordingSink();
  const analytics = new AnalyticsService(sink);
  analytics.onModuleInit();
  return { sink, analytics };
}

describe('AnalyticsService', () => {
  beforeAll(() => Logger.overrideLogger(false));
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not touch the database per event: sends one batch every 10 s', async () => {
    const { sink, analytics } = setup();
    analytics.track({ type: 'room_created', room: 'ABCD', data: { nickname: 'Аня' } }, 1000);
    analytics.track({ type: 'room_joined', room: 'ABCD', data: { nickname: 'Бек' } }, 2000);
    expect(sink.batches).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS);
    expect(sink.batches).toHaveLength(1);
    expect(sink.batches[0]).toEqual([
      { type: 'room_created', room: 'ABCD', data: { nickname: 'Аня' }, at: new Date(1000), version: APP_VERSION },
      { type: 'room_joined', room: 'ABCD', data: { nickname: 'Бек' }, at: new Date(2000), version: APP_VERSION },
    ]);
    expect(analytics.pending).toBe(0);
  });

  it('splits a long queue into batches', async () => {
    const { sink, analytics } = setup();
    for (let i = 0; i < MAX_BATCH + 10; i++) analytics.track({ type: 'player_seen' });
    await analytics.flush();
    expect(sink.batches.map((b) => b.length)).toEqual([MAX_BATCH, 10]);
  });

  it('the database is down: the game does not notice, events wait and go out later', async () => {
    const { sink, analytics } = setup();
    sink.fail = true;
    analytics.track({ type: 'round_started', room: 'ABCD' });
    await expect(analytics.flush()).resolves.toBeUndefined();
    expect(analytics.pending).toBe(1);

    analytics.track({ type: 'round_finished', room: 'ABCD' });
    sink.fail = false;
    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS);
    expect(sink.events.map((e) => e.type)).toEqual(['round_started', 'round_finished']);
  });

  it('keeps at most MAX_QUEUE events while the database is down, dropping the oldest', async () => {
    const { sink, analytics } = setup();
    sink.fail = true;
    for (let i = 0; i < MAX_QUEUE + 3; i++) analytics.track({ type: 'player_seen', data: { i } });
    await analytics.flush();
    expect(analytics.pending).toBe(MAX_QUEUE);

    sink.fail = false;
    await analytics.flush();
    expect(sink.events).toHaveLength(MAX_QUEUE);
    expect(sink.events[0]!.data).toEqual({ i: 3 });
  });

  it('a flush while another is running does not send the same events twice', async () => {
    const { sink, analytics } = setup();
    analytics.track({ type: 'player_seen' });
    await Promise.all([analytics.flush(), analytics.flush()]);
    expect(sink.events).toHaveLength(1);
  });

  it('on shutdown writes what is left and closes the connection', async () => {
    const { sink, analytics } = setup();
    analytics.track({ type: 'player_seen' });
    await analytics.onApplicationShutdown();
    expect(sink.events).toHaveLength(1);
    expect(sink.closed).toBe(true);
  });

  it('without DATABASE_URL tracks nothing and starts no timer', () => {
    const analytics = new AnalyticsService(new NullSink());
    analytics.onModuleInit();
    analytics.track({ type: 'player_seen' });
    expect(analytics.pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('playerKey', () => {
  it('is stable for one browser, differs between browsers, and does not reveal the session secret', () => {
    const session = 'abcdefghijklmnop1234';
    expect(playerKey(session)).toBe(playerKey(session));
    expect(playerKey(session)).not.toBe(playerKey('abcdefghijklmnop1235'));
    expect(playerKey(session)).toHaveLength(16);
    expect(playerKey(session)).not.toContain('abcdefgh');
  });
});
