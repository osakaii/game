import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { CreateRoomSchema, JoinRoomSchema, type RoomResult } from '@mecha/shared';
import { parseInput, respond } from '../common/game-error';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import {
  GATEWAY_OPTIONS,
  playerIdOf,
  playerRoom,
  type GameServer,
  type GameSocket,
} from '../common/socket-types';
import { SessionService } from '../session/session.service';
import { emitRoomSkins } from './emit-skins';
import type { Room } from './room';
import { RoomEvents } from './room-events';
import { RoomsService } from './rooms.service';

/**
 * Тонкий слой между сетью и RoomsService:
 * проверить вход -> вызвать сервис -> синхронизировать socket.io-комнаты -> сообщить о событии.
 * Плюс переводит доменные события (RoomEvents) в сетевые сообщения.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
@UseGuards(RateLimitGuard)
export class RoomsGateway implements OnGatewayInit {
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  server: GameServer;

  // Nest сам создаст зависимости и передаст сюда (dependency injection).
  constructor(
    private readonly rooms: RoomsService,
    private readonly events: RoomEvents,
    private readonly sessions: SessionService,
  ) {}

  afterInit() {
    this.events.changed.subscribe((room) => {
      this.server.to(room.code).emit('room:state', room.toSnapshot());
    });
    this.events.teleported.subscribe(({ playerId, position }) => {
      this.server.to(playerRoom(playerId)).emit('player:teleport', position);
    });
    // Игрок не вернулся за отведённое время — теперь убираем его из комнаты по-настоящему.
    this.sessions.expired.subscribe((playerId) => this.removeFromRoom(playerId));
  }

  // @MessageBody() типизируем как unknown: из сети может прийти что угодно, тип даёт только parseInput.
  @SubscribeMessage('room:create')
  @RateLimit(1, 3)
  create(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): RoomResult {
    return respond(() => {
      const { nickname } = parseInput(CreateRoomSchema, body);
      this.leaveCurrentRoom(client);
      const room = this.rooms.create(playerIdOf(client), nickname);
      return this.enter(client, room);
    });
  }

  @SubscribeMessage('room:join')
  @RateLimit(1, 3)
  join(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): RoomResult {
    return respond(() => {
      const { nickname, code } = parseInput(JoinRoomSchema, body);
      const current = this.rooms.roomOf(playerIdOf(client));
      if (current?.code === code) {
        // Повторный join в ту же комнату (двойной тап) — просто вернуть текущее состояние.
        return current.toSnapshot();
      }
      // Сначала проверяем новую комнату и только потом выходим из текущей:
      // иначе неудачный join (неверный код) выкинул бы игрока из комнаты, где он был.
      this.rooms.assertJoinable(code);
      this.leaveCurrentRoom(client);
      const room = this.rooms.join(playerIdOf(client), nickname, code);
      return this.enter(client, room);
    });
  }

  @SubscribeMessage('room:leave')
  @RateLimit(1, 3)
  leave(@ConnectedSocket() client: GameSocket): void {
    this.leaveCurrentRoom(client);
  }

  /**
   * socket.io-комната (client.join) — механизм рассылки: server.to(code).emit(...)
   * отправит событие всем сокетам в ней. Наш Room — игровая модель. Держим их в синхроне.
   */
  private enter(client: GameSocket, room: Room) {
    client.join(room.code);
    this.events.changed.next(room);
    // Позицию на спавне выдаёт сервер — клиент не выбирает, где появиться.
    const playerId = playerIdOf(client);
    const { x, y, z } = room.member(playerId)!.state;
    this.events.teleported.next({ playerId, position: { x, y, z } });
    emitRoomSkins(client, room);
    return room.toSnapshot();
  }

  private leaveCurrentRoom(client: GameSocket) {
    const code = this.removeFromRoom(playerIdOf(client));
    if (code) client.leave(code);
  }

  /** Убрать игрока из комнаты и сообщить остальным. Сокета может уже не быть (сессия истекла). */
  private removeFromRoom(playerId: string): string | null {
    const result = this.rooms.leave(playerId);
    if (!result) return null;
    if (result.room) {
      this.events.changed.next(result.room);
      this.events.playerLeft.next(result.room);
    }
    this.logger.log(`${playerId} left ${result.code}`);
    return result.code;
  }
}
