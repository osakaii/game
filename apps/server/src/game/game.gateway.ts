import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PaintSchema, ShootSchema, type EmptyResult, type Result, type ShotResult } from '@mecha/shared';
import { GameError, parseInput, respond } from '../common/game-error';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { GATEWAY_OPTIONS, playerIdOf, type GameServer, type GameSocket } from '../common/socket-types';
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
  }

  @SubscribeMessage('seek:shoot')
  @RateLimit(4, 6)
  shoot(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): Result<ShotResult> {
    return respond(() => {
      const { origin, dir } = parseInput(ShootSchema, body);
      const room = this.rooms.roomOf(playerIdOf(client));
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      return this.game.shoot(room, playerIdOf(client), origin, dir);
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

  @SubscribeMessage('player:paint')
  @RateLimit(15, 20)
  paint(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): EmptyResult {
    return respond(() => {
      const { zones, color } = parseInput(PaintSchema, body);
      const room = this.rooms.roomOf(playerIdOf(client));
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      this.game.paint(room, playerIdOf(client), zones, color);
      return null;
    });
  }
}
