import { Logger } from '@nestjs/common';
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PROTOCOL_VERSION, type PingPayload, type PongPayload } from '@mecha/shared';
import { GATEWAY_OPTIONS, type GameServer, type GameSocket } from '../common/socket-types';

/**
 * Gateway — аналог контроллера, только для WebSocket.
 * Без порта в декораторе socket.io цепляется к тому же HTTP-серверу, что и Nest.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class NetGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NetGateway.name);

  @WebSocketServer()
  server: GameServer;

  handleConnection(client: GameSocket) {
    this.logger.log(`connected ${client.id} (total ${this.server.engine.clientsCount})`);
    client.emit('net:welcome', {
      playerId: client.id,
      protocolVersion: PROTOCOL_VERSION,
      serverTime: Date.now(),
    });
  }

  handleDisconnect(client: GameSocket) {
    this.logger.log(`disconnected ${client.id}`);
  }

  /** Возвращаемое значение Nest отправит клиенту как ack (ответ на emit с колбэком). */
  @SubscribeMessage('net:ping')
  handlePing(@MessageBody() payload: PingPayload): PongPayload {
    return { clientTime: payload.clientTime, serverTime: Date.now() };
  }
}
