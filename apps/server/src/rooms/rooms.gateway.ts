import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { CreateRoomSchema, JoinRoomSchema, type RoomResult } from '@mecha/shared';
import { parseInput, respond } from '../common/game-error';
import { GATEWAY_OPTIONS, type GameServer, type GameSocket } from '../common/socket-types';
import type { Room } from './room';
import { RoomEvents } from './room-events';
import { RoomsService } from './rooms.service';

/**
 * Тонкий слой между сетью и RoomsService:
 * проверить вход -> вызвать сервис -> синхронизировать socket.io-комнаты -> сообщить о событии.
 * Плюс переводит доменные события (RoomEvents) в сетевые сообщения.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class RoomsGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  server: GameServer;

  // Nest сам создаст зависимости и передаст сюда (dependency injection).
  constructor(
    private readonly rooms: RoomsService,
    private readonly events: RoomEvents,
  ) {}

  afterInit() {
    this.events.changed.subscribe((room) => {
      this.server.to(room.code).emit('room:state', room.toSnapshot());
    });
    // Каждый сокет socket.io автоматически состоит в комнате со своим id — так шлём одному игроку.
    this.events.teleported.subscribe(({ playerId, position }) => {
      this.server.to(playerId).emit('player:teleport', position);
    });
  }

  // @MessageBody() типизируем как unknown: из сети может прийти что угодно, тип даёт только parseInput.
  @SubscribeMessage('room:create')
  create(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): RoomResult {
    return respond(() => {
      const { nickname } = parseInput(CreateRoomSchema, body);
      this.leaveCurrentRoom(client);
      const room = this.rooms.create(client.id, nickname);
      return this.enter(client, room);
    });
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): RoomResult {
    return respond(() => {
      const { nickname, code } = parseInput(JoinRoomSchema, body);
      if (this.rooms.roomOf(client.id)?.code === code) {
        // Повторный join в ту же комнату (двойной тап) — просто вернуть текущее состояние.
        return this.rooms.roomOf(client.id)!.toSnapshot();
      }
      // Сначала проверяем новую комнату и только потом выходим из текущей:
      // иначе неудачный join (неверный код) выкинул бы игрока из комнаты, где он был.
      this.rooms.assertJoinable(code);
      this.leaveCurrentRoom(client);
      const room = this.rooms.join(client.id, nickname, code);
      return this.enter(client, room);
    });
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() client: GameSocket): void {
    this.leaveCurrentRoom(client);
  }

  handleDisconnect(client: GameSocket) {
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
    const { x, y, z } = room.member(client.id)!.state;
    this.events.teleported.next({ playerId: client.id, position: { x, y, z } });
    return room.toSnapshot();
  }

  private leaveCurrentRoom(client: GameSocket) {
    const result = this.rooms.leave(client.id);
    if (!result) return;
    client.leave(result.code);
    if (result.room) {
      this.events.changed.next(result.room);
      this.events.playerLeft.next(result.room);
    }
    this.logger.log(`${client.id} left ${result.code}`);
  }
}
