import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ShootSchema,
  UpdateSettingsSchema,
  type EmptyResult,
  type Result,
  type ShotResult,
} from '@mecha/shared';
import { GameError, parseInput, respond } from '../common/game-error';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import {
  GATEWAY_OPTIONS,
  playerIdOf,
  playerRoom,
  type GameServer,
  type GameSocket,
} from '../common/socket-types';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { GameService } from './game.service';

@WebSocketGateway(GATEWAY_OPTIONS)
@UseGuards(RateLimitGuard)
export class GameGateway implements OnGatewayInit {
  @WebSocketServer()
  server: GameServer;

  constructor(
    private readonly rooms: RoomsService,
    private readonly game: GameService,
    private readonly events: RoomEvents,
  ) {}

  afterInit() {
    this.events.shot.subscribe(({ room, shot }) => this.server.to(room.code).emit('seek:shot', shot));
    // Новую кожу — всем в комнате, кроме автора: у него она и так на экране.
    this.events.skin.subscribe(({ room, playerId }) => {
      const { revision, image } = room.member(playerId)?.skin ?? {};
      if (!image || revision === undefined) return;
      this.server.to(room.code).except(playerRoom(playerId)).emit('player:skin', { playerId, revision, image });
    });
  }

  @SubscribeMessage('seek:shoot')
  @RateLimit(4, 6)
  shoot(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): Result<ShotResult> {
    return respond(() => {
      const { origin, dir, viewTime } = parseInput(ShootSchema, body);
      const room = this.rooms.roomOf(playerIdOf(client));
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      return this.game.shoot(room, playerIdOf(client), origin, dir, Date.now(), viewTime);
    });
  }

  @SubscribeMessage('game:start')
  @RateLimit(1, 2)
  start(@ConnectedSocket() client: GameSocket): EmptyResult {
    return respond(() => {
      const room = this.rooms.roomOf(playerIdOf(client));
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      this.game.start(room, playerIdOf(client));
      return null;
    });
  }

  @SubscribeMessage('room:settings')
  @RateLimit(4, 6)
  settings(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): EmptyResult {
    return respond(() => {
      const patch = parseInput(UpdateSettingsSchema, body);
      const room = this.rooms.roomOf(playerIdOf(client));
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      this.game.updateSettings(room, playerIdOf(client), patch);
      return null;
    });
  }

  @SubscribeMessage('player:skin')
  @RateLimit(2, 3)
  skin(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): Result<{ revision: number }> {
    return respond(() => {
      // Бинарные данные socket.io отдаёт как Buffer (это Uint8Array). Всё остальное — мусор.
      if (!(body instanceof Uint8Array)) throw new GameError('INVALID_INPUT', 'skin must be binary');
      const room = this.rooms.roomOf(playerIdOf(client));
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      return { revision: this.game.uploadSkin(room, playerIdOf(client), body) };
    });
  }
}
