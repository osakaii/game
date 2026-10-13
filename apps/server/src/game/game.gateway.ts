import { ConnectedSocket, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { EmptyResult } from '@mecha/shared';
import { GameError, respond } from '../common/game-error';
import { GATEWAY_OPTIONS, type GameSocket } from '../common/socket-types';
import { RoomsService } from '../rooms/rooms.service';
import { GameService } from './game.service';

@WebSocketGateway(GATEWAY_OPTIONS)
export class GameGateway {
  constructor(
    private readonly rooms: RoomsService,
    private readonly game: GameService,
  ) {}

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() client: GameSocket): EmptyResult {
    return respond(() => {
      const room = this.rooms.roomOf(client.id);
      if (!room) throw new GameError('ROOM_NOT_FOUND');
      this.game.start(room, client.id);
      return null;
    });
  }
}
