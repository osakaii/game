import { describe, expect, it, vi } from 'vitest';
import type { RoomSnapshot } from '@mecha/shared';
import { GameSounds } from './game-sounds';

function setup() {
  const sfx = { splat: vi.fn(), found: vi.fn(), tick: vi.fn(), phase: vi.fn(), win: vi.fn(), lose: vi.fn() };
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
