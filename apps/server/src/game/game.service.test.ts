import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_RULES, type RoomPhase } from '@mecha/shared';
import { GameError } from '../common/game-error';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { GameService } from './game.service';

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

    vi.advanceTimersByTime(GAME_RULES.hideSeconds * 1000);
    expect(room.phase).toBe('seeking');

    vi.advanceTimersByTime(GAME_RULES.seekSeconds * 1000);
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
    vi.advanceTimersByTime(GAME_RULES.hideSeconds * 1000);
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

describe('GameService.paint', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('paints in lobby and broadcasts the change', () => {
    const { game, room, phases } = setup(2);
    game.paint(room, 'p0', ['head', 'torso'], '#123456');
    expect(room.member('p0')!.colors.head).toBe('#123456');
    expect(room.member('p0')!.colors.legLeft).toBe('#f2f2f2');
    expect(phases).toEqual(['lobby']);
  });

  it('rate-limits paint spam', () => {
    const { game, room } = setup(2);
    game.paint(room, 'p0', ['head'], '#111111', 1000);
    expect(() => game.paint(room, 'p0', ['head'], '#222222', 1010)).toThrowError(/RATE_LIMITED/);
    expect(() => game.paint(room, 'p0', ['head'], '#222222', 1100)).not.toThrow();
  });

  it('lets only hiders paint while hiding, nobody while seeking', () => {
    const { game, room } = setup(2);
    game.start(room, 'p0');
    const seeker = room.allMembers().find((m) => m.role === 'seeker')!;
    const hider = room.allMembers().find((m) => m.role === 'hider')!;
    expect(seeker.colors.head).toBe('#d62828');

    expect(() => game.paint(room, seeker.id, ['head'], '#ffffff')).toThrowError(/PAINT_NOT_ALLOWED/);
    expect(() => game.paint(room, hider.id, ['head'], '#00ff00')).not.toThrow();

    vi.advanceTimersByTime(GAME_RULES.hideSeconds * 1000);
    expect(() => game.paint(room, hider.id, ['torso'], '#00ff00', Date.now() + 1000)).toThrowError(
      /PAINT_NOT_ALLOWED/,
    );
  });
});
