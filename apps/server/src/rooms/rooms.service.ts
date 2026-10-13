import { Injectable, Logger } from '@nestjs/common';
import { GameError } from '../common/game-error';
import { Room } from './room';
import { generateRoomCode } from './room-code';

export interface LeaveResult {
  code: string;
  /** null — комната опустела и удалена. */
  room: Room | null;
}

/**
 * Реестр комнат в памяти процесса. Singleton-провайдер Nest:
 * один экземпляр на всё приложение, его получают через DI.
 *
 * Сокетов здесь нет — только правила. Рассылкой занимается gateway.
 */
@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
  private readonly rooms = new Map<string, Room>();
  /** Обратный индекс игрок -> код комнаты, чтобы не перебирать все комнаты при отключении. */
  private readonly playerRooms = new Map<string, string>();

  get roomCount(): number {
    return this.rooms.size;
  }

  allRooms(): IterableIterator<Room> {
    return this.rooms.values();
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  roomOf(playerId: string): Room | undefined {
    const code = this.playerRooms.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  create(playerId: string, nickname: string): Room {
    this.assertNotInRoom(playerId);
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new Room(code);
    this.rooms.set(code, room);
    this.addToRoom(room, playerId, nickname);
    this.logger.log(`room ${code} created by ${nickname} (rooms: ${this.rooms.size})`);
    return room;
  }

  join(playerId: string, nickname: string, code: string): Room {
    this.assertNotInRoom(playerId);
    const room = this.assertJoinable(code);
    this.addToRoom(room, playerId, nickname);
    return room;
  }

  /** Проверить, что в комнату можно войти, ничего не меняя. */
  assertJoinable(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new GameError('ROOM_NOT_FOUND');
    // В results тоже не пускаем: через пару секунд комната вернётся в лобби.
    if (room.phase !== 'lobby') throw new GameError('GAME_IN_PROGRESS');
    if (room.isFull) throw new GameError('ROOM_FULL');
    return room;
  }

  leave(playerId: string): LeaveResult | undefined {
    const code = this.playerRooms.get(playerId);
    if (!code) return undefined;
    this.playerRooms.delete(playerId);

    const room = this.rooms.get(code)!;
    room.removePlayer(playerId);
    if (room.isEmpty) {
      this.rooms.delete(code);
      this.logger.log(`room ${code} closed (rooms: ${this.rooms.size})`);
      return { code, room: null };
    }
    return { code, room };
  }

  private addToRoom(room: Room, playerId: string, nickname: string) {
    room.addPlayer(playerId, nickname);
    this.playerRooms.set(playerId, room.code);
  }

  private assertNotInRoom(playerId: string) {
    if (this.playerRooms.has(playerId)) throw new GameError('ALREADY_IN_ROOM');
  }
}
