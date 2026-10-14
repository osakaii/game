import { Logger, UseGuards } from '@nestjs/common';
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PROTOCOL_VERSION, SessionIdSchema, type PingPayload, type PongPayload } from '@mecha/shared';
import { BUILD_INFO } from '../common/build-info';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { GATEWAY_OPTIONS, playerRoom, type GameServer, type GameSocket } from '../common/socket-types';
import { emitRoomSkins } from '../rooms/emit-skins';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { SessionService } from '../session/session.service';

/**
 * Подключение и отключение: сессии, приветствие, пинг.
 * Gateway — аналог контроллера, только для WebSocket.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
@UseGuards(RateLimitGuard)
export class NetGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NetGateway.name);

  @WebSocketServer()
  server: GameServer;

  constructor(
    private readonly sessions: SessionService,
    private readonly rooms: RoomsService,
    private readonly events: RoomEvents,
  ) {}

  /**
   * Middleware socket.io выполняется ДО подключения. next(error) — соединение отклоняется,
   * клиент получает connect_error. Так ни один обработчик не увидит сокет без сессии.
   */
  afterInit(server: GameServer) {
    server.use((socket, next) => {
      const parsed = SessionIdSchema.safeParse(socket.handshake.auth?.sessionId);
      if (!parsed.success) return next(new Error('invalid session'));
      socket.data.sessionId = parsed.data;
      next();
    });
  }

  handleConnection(client: GameSocket) {
    const { playerId, resumed, replacedSocketId } = this.sessions.attach(client.data.sessionId, client.id);
    client.data.playerId = playerId;
    client.join(playerRoom(playerId));

    // Та же сессия открыта в другой вкладке — старую отключаем.
    // disconnect с сервера клиент socket.io не переподключает сам, поэтому «пинг-понга» вкладок не будет.
    if (replacedSocketId) this.server.sockets.sockets.get(replacedSocketId)?.disconnect(true);

    const room = this.rooms.roomOf(playerId);
    client.emit('net:welcome', {
      playerId,
      protocolVersion: PROTOCOL_VERSION,
      serverTime: Date.now(),
      roomCode: room?.code ?? null,
      build: BUILD_INFO,
    });

    if (room) {
      // Вернулся в свою комнату: подписываем новый сокет на рассылку и возвращаем на его место.
      const member = room.member(playerId)!;
      client.join(room.code);
      room.setConnected(member, true);
      this.events.changed.next(room);
      const { x, y, z } = member.state;
      this.events.teleported.next({ playerId, position: { x, y, z } });
      emitRoomSkins(client, room);
    }
    this.logger.log(`${resumed ? 'reconnected' : 'connected'} ${playerId} (sockets: ${this.server.engine.clientsCount})`);
  }

  handleDisconnect(client: GameSocket) {
    const { sessionId, playerId } = client.data;
    if (!playerId) return; // отклонён middleware — сессии нет
    this.sessions.detach(sessionId, client.id);
    if (this.sessions.isConnected(sessionId)) return; // уже переподключился другим сокетом

    const room = this.rooms.roomOf(playerId);
    const member = room?.member(playerId);
    if (room && member) {
      room.setConnected(member, false);
      this.events.changed.next(room);
    }
    this.logger.log(`disconnected ${playerId}, waiting for reconnect`);
  }

  /** Возвращаемое значение Nest отправит клиенту как ack (ответ на emit с колбэком). */
  @SubscribeMessage('net:ping')
  @RateLimit(2, 5)
  handlePing(@MessageBody() payload: PingPayload): PongPayload {
    return { clientTime: payload.clientTime, serverTime: Date.now() };
  }
}
