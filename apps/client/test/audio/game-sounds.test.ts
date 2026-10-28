import { describe, expect, it, vi } from 'vitest';
import type { RoomSnapshot } from '@mecha/shared';
import { GameSounds, spatialize, type Listener } from '../../src/audio/game-sounds';

function setup() {
  const sfx = { splat: vi.fn(), found: vi.fn(), tick: vi.fn(), phase: vi.fn(), win: vi.fn(), lose: vi.fn(), whistle: vi.fn() };
  return { sfx, sounds: new GameSounds(sfx) };
}
const room = (phase: RoomSnapshot['phase'], extra: Partial<RoomSnapshot> = {}) =>
  ({ code: 'X', hostId: 'a', maxPlayers: 8, phase, phaseEndsAt: null, result: null, players: [], ...extra }) as RoomSnapshot;

describe('GameSounds', () => {
  it('plays phase sound on transitions but not on joining', () => {
    const { sfx, sounds } = setup();
    sounds.onRoom(room('lobby'), null);
    sounds.onRoom(room('hiding'), 'hider');
    sounds.onRoom(room('hiding'), 'hider'); // повторный room:state той же фазы
    expect(sfx.phase).toHaveBeenCalledTimes(1);
  });

  it('plays win or lose depending on my role', () => {
    const { sfx, sounds } = setup();
    sounds.onRoom(room('seeking'), 'hider');
    sounds.onRoom(room('results', { result: { winner: 'hider', reason: 'time_up' } }), 'hider');
    expect(sfx.win).toHaveBeenCalled();
    expect(sfx.lose).not.toHaveBeenCalled();
  });

  it('makes far splats quieter', () => {
    const { sfx, sounds } = setup();
    const me = { x: 0, y: 0, z: 0 };
    sounds.onShot({ seekerId: 's', hitPlayerId: null, point: { x: 2, y: 0, z: 0 } }, me);
    sounds.onShot({ seekerId: 's', hitPlayerId: null, point: { x: 18, y: 0, z: 0 } }, me);
    const [near, far] = sfx.splat.mock.calls.map(([v]) => v as number);
    expect(near).toBeGreaterThan(far);
  });

  it('ticks once per second during the last seconds', () => {
    const { sfx, sounds } = setup();
    const r = room('hiding', { phaseEndsAt: 10_000 });
    for (let t = 0; t <= 10_000; t += 16) sounds.update(r, t);
    expect(sfx.tick).toHaveBeenCalledTimes(5);
  });
});

describe('hint whistles', () => {
  // Камера в нуле смотрит в −Z: правое ухо — +X.
  const listener: Listener = { position: { x: 0, y: 1.6, z: 0 }, rightX: 1, rightZ: 0 };

  it('a whistle on the right is panned right, on the left — left; far away is quieter but never silent', () => {
    const right = spatialize(listener, { x: 10, y: 1.6, z: 0 });
    const left = spatialize(listener, { x: -10, y: 1.6, z: 0 });
    const ahead = spatialize(listener, { x: 0, y: 1.6, z: -10 });
    expect(right.pan).toBeGreaterThan(0.5);
    expect(left.pan).toBeLessThan(-0.5);
    expect(Math.abs(ahead.pan)).toBeLessThan(0.01);
    const far = spatialize(listener, { x: 0, y: 1.6, z: -170 });
    expect(far.volume).toBeLessThan(ahead.volume);
    expect(far.volume).toBeGreaterThan(0);
  });

  it('every hider whistles from their spot; my own whistle is centred', () => {
    const { sfx, sounds } = setup();
    sounds.onHint({ players: [{ id: 'me', x: 50, y: 0, z: 0 }, { id: 'other', x: -20, y: 0, z: 0 }] }, 'me', listener);
    expect(sfx.whistle).toHaveBeenCalledTimes(2);
    expect(sfx.whistle.mock.calls[0]).toEqual([0.6, 0]);
    expect(sfx.whistle.mock.calls[1][1]).toBeLessThan(0);
  });
});
