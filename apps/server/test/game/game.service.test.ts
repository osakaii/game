import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, GAME_RULES, type RoomPhase } from '@mecha/shared';
import { GameError } from '../../src/common/game-error';
import { RoomEvents } from '../../src/rooms/room-events';
import { RoomsService } from '../../src/rooms/rooms.service';
import { GameService } from '../../src/game/game.service';

/**
 * Таймеры фаз тестируем с «фальшивым временем»: vi.advanceTimersByTime(ms)
 * мгновенно прокручивает часы, и 150-секундный раунд проходит за миллисекунды.
 */
function setup(players = 3) {
  const rooms = new RoomsService();
  const events = new RoomEvents();
  const game = new GameService(rooms, events);
  game.onModuleInit();

  const room = rooms.create('p0', 'Host');
  for (let i = 1; i < players; i++) rooms.join(`p${i}`, `P${i}`, room.code);

  const phases: RoomPhase[] = [];
  events.changed.subscribe((r) => phases.push(r.phase));
  const teleports: string[] = [];
  events.teleported.subscribe((t) => teleports.push(t.playerId));

  /** Как RoomsGateway: убрать игрока и сообщить об этом. */
  const leave = (id: string) => {
    const result = rooms.leave(id);
    if (result?.room) events.playerLeft.next(result.room);
  };
  return { rooms, events, game, room, phases, teleports, leave };
}

describe('GameService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only the host can start, and only with enough players', () => {
    const { game, room } = setup(1);
    expect(() => game.start(room, 'p0')).toThrowError(GameError);
    const two = setup(2);
    expect(() => two.game.start(two.room, 'p1')).toThrowError(/NOT_HOST/);
  });

  it('assigns roles and teleports everyone', () => {
    const { game, room, teleports } = setup(6);
    game.start(room, 'p0');
    const roles = room.allMembers().map((m) => m.role);
    expect(roles.filter((r) => r === 'seeker')).toHaveLength(2);
    expect(roles.filter((r) => r === 'hider')).toHaveLength(4);
    expect(teleports).toHaveLength(6);
  });

  it('runs hiding -> seeking -> results -> lobby on timers', () => {
    const { game, room, phases } = setup();
    game.start(room, 'p0');
    expect(room.phase).toBe('hiding');

    vi.advanceTimersByTime(DEFAULT_SETTINGS.hideSeconds * 1000);
    expect(room.phase).toBe('seeking');

    vi.advanceTimersByTime(DEFAULT_SETTINGS.seekSeconds * 1000);
    expect(room.phase).toBe('results');
    expect(room.result).toEqual({ winner: 'hider', reason: 'time_up' });

    vi.advanceTimersByTime(GAME_RULES.resultsSeconds * 1000);
    expect(room.phase).toBe('lobby');
    expect(room.allMembers().every((m) => m.role === null)).toBe(true);
    expect(phases).toEqual(['hiding', 'seeking', 'results', 'lobby']);
  });

  it('ends the round early when all seekers leave, and cancels the old timer', () => {
    const { game, room, leave } = setup(3);
    game.start(room, 'p0');
    const seeker = room.allMembers().find((m) => m.role === 'seeker')!;
    leave(seeker.id);
    expect(room.result).toEqual({ winner: 'hider', reason: 'seekers_left' });

    // «Старый» таймер конца пряток не должен перевести results в seeking.
    vi.advanceTimersByTime(DEFAULT_SETTINGS.hideSeconds * 1000);
    expect(room.phase).not.toBe('seeking');
  });

  it('seekers win when all hiders leave', () => {
    const { game, room, leave } = setup(2);
    game.start(room, 'p0');
    const hider = room.allMembers().find((m) => m.role === 'hider')!;
    leave(hider.id);
    expect(room.result).toEqual({ winner: 'seeker', reason: 'hiders_left' });
  });

  it('ignores timers of a room that was deleted', () => {
    const { game, room, leave } = setup(2);
    game.start(room, 'p0');
    leave('p0');
    leave('p1');
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});

/** Минимальный «PNG» 512×512: сигнатура + заголовок IHDR. Сервер смотрит только на них. */
function fakePng(size = 512, extraBytes = 0): Uint8Array {
  const bytes = new Uint8Array(33 + extraBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, size);
  new DataView(bytes.buffer).setUint32(20, size);
  return bytes;
}

describe('GameService.uploadSkin', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores the skin in lobby, bumps the revision and announces it', () => {
    const { game, room, events } = setup(2);
    const announced: string[] = [];
    events.skin.subscribe((e) => announced.push(e.playerId));

    const revision = game.uploadSkin(room, 'p0', fakePng(), 5000);
    expect(revision).toBe(1);
    expect(room.toSnapshot().players[0].skin).toEqual({ base: 'default', revision: 1, hasImage: true });
    expect(announced).toEqual(['p0']);
  });

  it('rejects wrong format, wrong size and oversized files', () => {
    const { game, room } = setup(2);
    const text = new TextEncoder().encode('definitely not an image, just some text here');
    expect(() => game.uploadSkin(room, 'p0', text, 5000)).toThrowError(/PNG or WebP/);
    expect(() => game.uploadSkin(room, 'p0', fakePng(1024), 7000)).toThrowError(/512x512/);
    expect(() => game.uploadSkin(room, 'p0', fakePng(512, 500 * 1024), 9000)).toThrowError(/too large/);
  });

  it('limits upload frequency', () => {
    const { game, room } = setup(2);
    game.uploadSkin(room, 'p0', fakePng(), 5000);
    expect(() => game.uploadSkin(room, 'p0', fakePng(), 5500)).toThrowError(/RATE_LIMITED/);
    expect(() => game.uploadSkin(room, 'p0', fakePng(), 6100)).not.toThrow();
  });

  it('round start resets skins: hiders to white, seekers to uniform; only hiders may paint', () => {
    const { game, room } = setup(2);
    game.uploadSkin(room, 'p0', fakePng(), 5000);
    game.start(room, 'p0');
    const seeker = room.allMembers().find((m) => m.role === 'seeker')!;
    const hider = room.allMembers().find((m) => m.role === 'hider')!;
    expect(seeker.skin).toMatchObject({ base: 'seeker', image: null });
    expect(hider.skin).toMatchObject({ base: 'default', image: null });

    expect(() => game.uploadSkin(room, seeker.id, fakePng(), Date.now() + 2000)).toThrowError(/PAINT_NOT_ALLOWED/);
    expect(() => game.uploadSkin(room, hider.id, fakePng(), Date.now() + 2000)).not.toThrow();

    vi.advanceTimersByTime(DEFAULT_SETTINGS.hideSeconds * 1000);
    expect(() => game.uploadSkin(room, hider.id, fakePng(), Date.now() + 5000)).toThrowError(/PAINT_NOT_ALLOWED/);
  });
});

describe('GameService.shoot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Раунд из 2 игроков в фазе поиска, ищущий и прячущийся стоят в известных местах. */
  function seekingRound() {
    const ctx = setup(2);
    ctx.game.start(ctx.room, 'p0');
    vi.advanceTimersByTime(DEFAULT_SETTINGS.hideSeconds * 1000);
    const seeker = ctx.room.allMembers().find((m) => m.role === 'seeker')!;
    const hider = ctx.room.allMembers().find((m) => m.role === 'hider')!;
    ctx.room.teleport(seeker, { x: 0, y: 0, z: 10 });
    ctx.room.teleport(hider, { x: 0, y: 0, z: 4 });
    // Камера за спиной ищущего, смотрит на прячущегося.
    const origin = { x: 0, y: 1.5, z: 13 };
    const shots: unknown[] = [];
    ctx.events.shot.subscribe((e) => shots.push(e.shot));
    return { ...ctx, seeker, hider, origin, shots };
  }

  it('finds a visible hider and ends the round when nobody is left', () => {
    const { game, room, seeker, hider, origin, shots } = seekingRound();
    const result = game.shoot(room, seeker.id, origin, { x: 0, y: 0, z: -1 });
    expect(result.hitPlayerId).toBe(hider.id);
    expect(hider.found).toBe(true);
    expect(room.result).toEqual({ winner: 'seeker', reason: 'all_found' });
    expect(shots).toHaveLength(1);
  });

  it('misses into the floor and applies the miss cooldown', () => {
    const { game, room, seeker, origin } = seekingRound();
    const now = Date.now();
    const result = game.shoot(room, seeker.id, origin, { x: 0, y: -1, z: 0 }, now);
    expect(result.hitPlayerId).toBeNull();
    expect(result.nextShotAt).toBe(now + GAME_RULES.shotCooldownMissMs);
    expect(() => game.shoot(room, seeker.id, origin, { x: 0, y: 0, z: -1 }, now + 100)).toThrowError(/RATE_LIMITED/);
  });

  it('rejects shots from a hider, from far away, or with a junk direction', () => {
    const { game, room, seeker, hider, origin } = seekingRound();
    expect(() => game.shoot(room, hider.id, origin, { x: 0, y: 0, z: -1 })).toThrowError(/SHOT_NOT_ALLOWED/);
    expect(() => game.shoot(room, seeker.id, { x: 0, y: 1.5, z: -10 }, { x: 0, y: 0, z: 1 })).toThrowError(
      /too far/,
    );
    expect(() => game.shoot(room, seeker.id, origin, { x: 0, y: 0, z: 0 })).toThrowError(/normalized/);
  });

  it('ghost mode: found players disappear from snapshots', () => {
    const { game, room, seeker, hider, origin } = seekingRound();
    room.applySettings({ foundMode: 'ghost' });
    game.shoot(room, seeker.id, origin, { x: 0, y: 0, z: -1 });
    expect(room.netPlayers().map((p) => p.id)).toEqual([seeker.id]);
    expect(hider.found).toBe(true);
    expect(hider.role).toBe('hider');
  });

  it('helper mode: found hider joins the seekers and keeps the round alive', () => {
    const ctx = setup(3);
    ctx.game.start(ctx.room, 'p0');
    vi.runOnlyPendingTimers(); // -> seeking
    const seeker = ctx.room.allMembers().find((m) => m.role === 'seeker')!;
    const [caught, other] = ctx.room.allMembers().filter((m) => m.role === 'hider');
    ctx.room.teleport(seeker, { x: 0, y: 0, z: 10 });
    ctx.room.teleport(caught, { x: 0, y: 0, z: 4 });
    ctx.room.teleport(other, { x: -12, y: 0, z: 12 });

    ctx.game.shoot(ctx.room, seeker.id, { x: 0, y: 1.5, z: 13 }, { x: 0, y: 0, z: -1 });
    expect(caught.role).toBe('seeker');
    expect(caught.skin).toMatchObject({ base: 'seeker', image: null });
    expect(ctx.room.netPlayers().some((p) => p.id === caught.id)).toBe(true);

    // Основной ищущий ушёл — помощник остаётся, раунд продолжается.
    ctx.leave(seeker.id);
    expect(ctx.room.phase).toBe('seeking');

    // Помощник сам находит последнего — победа ищущих «всех нашли».
    ctx.room.teleport(caught, { x: -12, y: 0, z: 6 });
    ctx.game.shoot(ctx.room, caught.id, { x: -12, y: 1.5, z: 3 }, { x: 0, y: 0, z: 1 });
    expect(ctx.room.result).toEqual({ winner: 'seeker', reason: 'all_found' });
    expect(caught.score).toBe(2);
  });

  it('lag compensation: hits where the seeker saw the hider, within the rewind limit', () => {
    const { game, room, seeker, hider, origin } = seekingRound();
    const t0 = Date.now();
    // Прячущийся стоял на линии выстрела, а 150 мс назад ушёл вбок на 2 м.
    hider.history.push(t0 + 50, { x: 0, y: 0, z: 4, crouching: false });
    hider.history.push(t0 + 200, { x: 2, y: 0, z: 4, crouching: false });
    hider.state = { ...hider.state, x: 2 };

    const now = t0 + 200;
    // Ищущий видел его ещё на линии (viewTime = t0 + 60) — засчитываем.
    expect(game.shoot(room, seeker.id, origin, { x: 0, y: 0, z: -1 }, now, t0 + 60).hitPlayerId).toBe(hider.id);
  });

  it('lag compensation is capped: a fake ancient viewTime does not help', () => {
    const { game, room, seeker, hider, origin } = seekingRound();
    const t0 = Date.now();
    hider.history.push(t0 + 50, { x: 0, y: 0, z: 4, crouching: false });
    hider.history.push(t0 + 1000, { x: 2, y: 0, z: 4, crouching: false });
    hider.state = { ...hider.state, x: 2 };
    // «Я видел его секунду назад» — сервер перематывает максимум на 300 мс.
    expect(game.shoot(room, seeker.id, origin, { x: 0, y: 0, z: -1 }, t0 + 1000, t0).hitPlayerId).toBeNull();
  });

  it('crouching hider is harder to hit: a shot over the head misses', () => {
    const { game, room, seeker, hider, origin } = seekingRound();
    hider.state = { ...hider.state, crouching: true };
    hider.history.push(Date.now(), hider.state);
    // Луч на высоте 1.3 м: стоящего задел бы, присевшего (0.9 м) — нет.
    const result = game.shoot(room, seeker.id, { ...origin, y: 1.3 }, { x: 0, y: 0, z: -1 });
    expect(result.hitPlayerId).toBeNull();
  });

  it('a hider lying flat is missed by a shot at knee height, hit by a shot at the floor', () => {
    const { game, room, seeker, hider, origin } = seekingRound();
    hider.state = { ...hider.state, pose: 'flat' };
    hider.history.push(Date.now(), hider.state);
    // «Пластом» тело ниже 0.5 м: луч на 0.7 м проходит над ним, на 0.3 м — попадает.
    expect(game.shoot(room, seeker.id, { ...origin, y: 0.7 }, { x: 0, y: 0, z: -1 }).hitPlayerId).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(game.shoot(room, seeker.id, { ...origin, y: 0.3 }, { x: 0, y: 0, z: -1 }).hitPlayerId).toBe(hider.id);
  });

  it('hits the legs of a lying hider where they really are — the body turns with yaw', () => {
    const { game, room, seeker, hider } = seekingRound();
    // Луч в точку на полу в 0.8 м слева от прячущегося: там его ноги, если он лежит головой на +X.
    const origin = { x: -0.8, y: 1.5, z: 9 };
    const target = { x: -0.8, y: 0.15, z: 4 };
    const length = Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z);
    const dir = { x: 0, y: (target.y - origin.y) / length, z: (target.z - origin.z) / length };

    hider.state = { ...hider.state, pose: 'flat', yaw: 0 }; // лежит вдоль Z — слева пусто
    hider.history.push(Date.now(), hider.state);
    expect(game.shoot(room, seeker.id, origin, dir).hitPlayerId).toBeNull();

    vi.advanceTimersByTime(5000);
    hider.state = { ...hider.state, yaw: Math.PI / 2 }; // развернулся: ноги теперь на −X
    hider.history.push(Date.now(), hider.state);
    expect(game.shoot(room, seeker.id, origin, dir).hitPlayerId).toBe(hider.id);
  });
});

describe('GameService settings, scoring and rotation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only the host changes settings, only in lobby; map change teleports everyone', () => {
    const { game, room, teleports } = setup(2);
    expect(() => game.updateSettings(room, 'p1', { mapId: 'garden' })).toThrowError(/NOT_HOST/);

    game.updateSettings(room, 'p0', { mapId: 'garden', hideSeconds: 20 });
    expect(room.map.id).toBe('garden');
    expect(room.settings.hideSeconds).toBe(20);
    expect(teleports).toHaveLength(2);

    game.start(room, 'p0');
    expect(() => game.updateSettings(room, 'p0', { mapId: 'kitchen' })).toThrowError(/GAME_IN_PROGRESS/);
    // Длительность пряток взята из настроек.
    vi.advanceTimersByTime(20_000);
    expect(room.phase).toBe('seeking');
  });

  it('respects the seekers setting but always leaves a hider', () => {
    const { game, room } = setup(3);
    game.updateSettings(room, 'p0', { seekers: 3 });
    game.start(room, 'p0');
    expect(room.allMembers().filter((m) => m.role === 'seeker')).toHaveLength(2);
  });

  it('rotates seekers: everybody seeks before anyone seeks twice', () => {
    const { game, room } = setup(4);
    const seekersByRound: string[] = [];
    for (let round = 0; round < 4; round++) {
      game.start(room, 'p0');
      seekersByRound.push(room.allMembers().find((m) => m.role === 'seeker')!.id);
      vi.runOnlyPendingTimers(); // hiding -> seeking
      vi.runOnlyPendingTimers(); // seeking -> results
      vi.runOnlyPendingTimers(); // results -> lobby
    }
    expect(new Set(seekersByRound).size).toBe(4);
  });

  it('scores finds for seekers and survival for hiders', () => {
    const { game, room } = setup(3);
    game.start(room, 'p0');
    vi.runOnlyPendingTimers(); // -> seeking
    const seeker = room.allMembers().find((m) => m.role === 'seeker')!;
    const [caught, survivor] = room.allMembers().filter((m) => m.role === 'hider');
    room.teleport(seeker, { x: 0, y: 0, z: 10 });
    room.teleport(caught, { x: 0, y: 0, z: 4 });
    room.teleport(survivor, { x: -12, y: 0, z: 12 });
    game.shoot(room, seeker.id, { x: 0, y: 1.5, z: 13 }, { x: 0, y: 0, z: -1 });

    vi.runOnlyPendingTimers(); // время вышло -> results
    expect(room.phase).toBe('results');
    expect(seeker.score).toBe(2);
    expect(caught.score).toBe(0);
    expect(survivor.score).toBe(3);
    expect(room.toSnapshot().players.find((p) => p.id === survivor.id)?.roundPoints).toBe(3);
  });
});
