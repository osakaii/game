import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '@mecha/shared';
import { GameError } from '../../src/common/game-error';
import { RoomsService } from '../../src/rooms/rooms.service';

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    expect((error as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

describe('RoomsService', () => {
  it('creates a room with the creator as host', () => {
    const service = new RoomsService();
    const room = service.create('a', 'Alice');
    expect(room.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(room.hostId).toBe('a');
    expect(service.roomOf('a')).toBe(room);
  });

  it('joins an existing room and deduplicates nicknames', () => {
    const service = new RoomsService();
    const room = service.create('a', 'Alex');
    service.join('b', 'Alex', room.code);
    expect(room.toSnapshot().players.map((p) => p.nickname)).toEqual(['Alex', 'Alex 2']);
  });

  it('rejects unknown room, full room and double membership', () => {
    const service = new RoomsService();
    expectGameError(() => service.join('a', 'A', 'ZZZZ'), 'ROOM_NOT_FOUND');

    const room = service.create('host', 'Host');
    for (let i = 1; i < MAX_PLAYERS; i++) service.join(`p${i}`, `P${i}`, room.code);
    expectGameError(() => service.join('late', 'Late', room.code), 'ROOM_FULL');
    expectGameError(() => service.create('host', 'Host'), 'ALREADY_IN_ROOM');
  });

  it('passes host to the oldest remaining player', () => {
    const service = new RoomsService();
    const room = service.create('a', 'A');
    service.join('b', 'B', room.code);
    service.join('c', 'C', room.code);

    const result = service.leave('a');
    expect(result?.room?.hostId).toBe('b');
  });

  it('deletes the room when the last player leaves', () => {
    const service = new RoomsService();
    const room = service.create('a', 'A');
    expect(service.leave('a')).toEqual({ code: room.code, room: null });
    expect(service.roomCount).toBe(0);
    expect(service.leave('a')).toBeUndefined();
  });
});
