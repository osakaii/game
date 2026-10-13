import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PlayerStateSchema, SNAPSHOT_RATE, canMove } from '@mecha/shared';
import { GATEWAY_OPTIONS, type GameServer, type GameSocket } from '../common/socket-types';
import { RoomsService } from '../rooms/rooms.service';
import { validateMove } from './move-validator';

/** Допуск на сдвиг замороженного игрока (м): клиент мог отправить пакет до того, как узнал о заморозке. */
const FROZEN_SLACK = 0.05;

/**
 * Приём позиций от клиентов и рассылка снимков мира.
 *
 * Модель «клиент считает, сервер проверяет»: клиент сам двигает своего персонажа
 * (никакой задержки управления), сервер принимает только правдоподобные позиции.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class MovementGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(MovementGateway.name);
  private tickTimer: ReturnType<typeof setInterval> | undefined;

  @WebSocketServer()
  server: GameServer;

  constructor(private readonly rooms: RoomsService) {}

  /** Хук Nest: сервер socket.io создан — запускаем тик рассылки. */
  afterInit() {
    this.tickTimer = setInterval(() => this.broadcastSnapshots(), 1000 / SNAPSHOT_RATE);
  }

  /** Хук Nest: приложение останавливается — не оставляем висящий таймер. */
  onModuleDestroy() {
    clearInterval(this.tickTimer);
  }

  @SubscribeMessage('player:state')
  onState(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): void {
    const parsed = PlayerStateSchema.safeParse(body);
    if (!parsed.success) return; // мусор молча игнорируем: отвечать на каждый — подарок для спама

    const room = this.rooms.roomOf(client.id);
    const member = room?.member(client.id);
    if (!room || !member) return;

    const now = Date.now();
    const next = parsed.data;
    const prev = member.state;
    // Ищущий в фазе пряток заморожен: поворачиваться можно, ходить нельзя.
    if (!canMove(room.phase, member.role) && Math.hypot(next.x - prev.x, next.z - prev.z) > FROZEN_SLACK) {
      client.emit('player:teleport', { x: prev.x, y: prev.y, z: prev.z });
      return;
    }

    const verdict = validateMove(prev, next, now - member.stateAt, room.map, room.colliders);
    if (!verdict.ok) {
      this.logger.warn(`rejected move from ${member.nickname}: ${verdict.reason}`);
      const { x, y, z } = member.state;
      client.emit('player:teleport', { x, y, z });
      return;
    }

    member.state = next;
    member.stateAt = now;
  }

  private broadcastSnapshots() {
    const t = Date.now();
    for (const room of this.rooms.allRooms()) {
      const players = room.netPlayers();
      // volatile: если клиент не успевает принимать — пакет выбрасывается, а не копится в очереди.
      // Старая позиция никому не нужна, следующий снимок через 50 мс всё равно её заменит.
      if (room.phase !== 'hiding') {
        this.server.volatile.to(room.code).emit('world:snapshot', { t, players });
        continue;
      }

      // Пока прячутся, ищущие не получают позиций прячущихся ВООБЩЕ.
      // Чёрный экран на клиенте можно убрать в DevTools, а данные, которых нет, — не подсмотришь.
      const seekerIds = room.allMembers().filter((m) => m.role === 'seeker').map((m) => m.id);
      const seekerSet = new Set(seekerIds);
      this.server.volatile.to(room.code).except(seekerIds).emit('world:snapshot', { t, players });
      this.server.volatile
        .to(seekerIds)
        .emit('world:snapshot', { t, players: players.filter((p) => seekerSet.has(p.id)) });
    }
  }
}
