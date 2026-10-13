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
import { GATEWAY_OPTIONS, type GameServer, type GameSocket } from '../common/socket-types';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { GameService } from './game.service';

@WebSocketGateway(GATEWAY_OPTIONS)
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
  shoot(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): Result<ShotResult> {
    return respond(() => {
      const { origin, dir } = parseInput(ShootSchema, body);
      const room = this.rooms.roomOf(client.id);
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      return this.game.shoot(room, client.id, origin, dir);
    });
  }

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() client: GameSocket): EmptyResult {
    return respond(() => {
      const room = this.rooms.roomOf(client.id);
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      this.game.start(room, client.id);
      return null;
    });
  }

  @SubscribeMessage('player:paint')
  paint(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): EmptyResult {
    return respond(() => {
      const { zones, color } = parseInput(PaintSchema, body);
      const room = this.rooms.roomOf(client.id);
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      this.game.paint(room, client.id, zones, color);
      return null;
    });
  }
}
