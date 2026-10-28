import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type ErrorCode, type RoomResult, type RoomSnapshot, type WelcomePayload } from '@mecha/shared';
import { Emitter } from '../../src/core/emitter';
import { Lobby, type RestoreKind } from '../../src/lobby/lobby';

const room = (code: string, playerId: string): RoomSnapshot => ({
  code,
  hostId: playerId,
  maxPlayers: 8,
  phase: 'lobby',
  phaseEndsAt: null,
  result: null,
  settings: DEFAULT_SETTINGS,
  round: 0,
  players: [],
});
const ok = (r: RoomSnapshot): RoomResult => ({ ok: true, data: r });
const fail = (error: ErrorCode): RoomResult => ({ ok: false, error });

/** Поддельная сеть: события как у Network, запросы — заглушки, которые задаёт тест. */
class FakeNetwork extends Emitter<{ welcome: WelcomePayload; roomState: RoomSnapshot }> {
  playerId = 'p1';
  state = 'online';
  createRoom = vi.fn(async (_payload: { nickname: string; code?: string }) => ok(room('KX7P', this.playerId)));
  joinRoom = vi.fn(async (_payload: { nickname: string; code: string }) => ok(room('KX7P', this.playerId)));
  welcome(roomCode: string | null, serverStartedAt = 1) {
    this.emit('welcome', { playerId: this.playerId, protocolVersion: 13, serverTime: 0, roomCode, build: { version: '1', commit: 'x' }, serverStartedAt });
  }
}

async function setup() {
  const network = new FakeNetwork();
  const lobby = new Lobby(network as never);
  const restored: RestoreKind[] = [];
  const lost: { code: string; reason: ErrorCode }[] = [];
  lobby.on('restored', (kind) => restored.push(kind));
  lobby.on('lost', (event) => lost.push(event));
  network.welcome(null);
  await lobby.create('Alex');
  network.createRoom.mockClear();
  return { network, lobby, restored, lost };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Lobby reconnect', () => {
  it('the server kept our place: resumed, no requests', async () => {
    const { network, restored } = await setup();
    network.welcome('KX7P');
    expect(restored).toEqual(['resumed']);
    expect(network.joinRoom).not.toHaveBeenCalled();
  });

  it('place expired but the room is alive: joins back by code with the same nickname', async () => {
    const { network, lobby, restored } = await setup();
    network.playerId = 'p2';
    network.welcome(null);
    await flush();
    expect(network.joinRoom).toHaveBeenCalledWith({ nickname: 'Alex', code: 'KX7P' });
    expect(restored).toEqual(['rejoined']);
    expect(lobby.room?.code).toBe('KX7P');
  });

  it('server restarted and the room is gone: recreates it under the same code', async () => {
    const { network, restored } = await setup();
    network.joinRoom.mockResolvedValueOnce(fail('ROOM_NOT_FOUND'));
    network.welcome(null, 2);
    await flush();
    expect(network.createRoom).toHaveBeenCalledWith({ nickname: 'Alex', code: 'KX7P' });
    expect(restored).toEqual(['restarted']);
  });

  it('a friend restored the room a moment earlier: joins it instead', async () => {
    const { network, restored } = await setup();
    network.joinRoom.mockResolvedValueOnce(fail('ROOM_NOT_FOUND'));
    network.createRoom.mockResolvedValueOnce(fail('ROOM_EXISTS'));
    network.welcome(null, 2);
    await flush();
    expect(network.joinRoom).toHaveBeenCalledTimes(2);
    expect(restored).toEqual(['restarted']);
  });

  it('cannot get back (a round started meanwhile): leaves the room and says why', async () => {
    const { network, lobby, lost, restored } = await setup();
    network.joinRoom.mockResolvedValueOnce(fail('GAME_IN_PROGRESS'));
    network.welcome(null);
    await flush();
    expect(lobby.room).toBeNull();
    expect(restored).toEqual([]);
    expect(lost).toEqual([{ code: 'KX7P', reason: 'GAME_IN_PROGRESS' }]);
  });
});
