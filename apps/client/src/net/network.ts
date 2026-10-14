import { io, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type CreateRoomPayload,
  type EmptyResult,
  type JoinRoomPayload,
  type PaintPayload,
  type PlayerState,
  type Result,
  type RoomResult,
  type RoomSnapshot,
  type ServerToClientEvents,
  type ShootPayload,
  type ShotEvent,
  type ShotResult,
  type UpdateSettingsPayload,
  type TeleportPayload,
  type WelcomePayload,
  type WorldSnapshot,
} from '@mecha/shared';
import { Emitter } from '../core/emitter';
import { ServerClock } from './server-clock';
import { getSessionId } from './session-id';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionState = 'connecting' | 'online' | 'offline';

interface NetworkEvents {
  status: { state: ConnectionState; text: string };
  ping: number;
  welcome: WelcomePayload;
  roomState: RoomSnapshot;
  snapshot: WorldSnapshot;
  teleport: TeleportPayload;
  shot: ShotEvent;
  /** Протокол сервера несовместим с этим клиентом — нужна перезагрузка. */
  outdated: void;
}

const PING_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Обёртка над socket.io: соединение, пинг и запросы.
 * Остальной код не знает про сокеты — только про методы и события Network.
 */
export class Network extends Emitter<NetworkEvents> {
  private readonly socket: GameSocket;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  readonly clock = new ServerClock();
  playerId: string | null = null;
  state: ConnectionState = 'connecting';

  constructor() {
    super();
    // Без URL socket.io подключится к текущему origin (в dev его проксирует Vite).
    const url = import.meta.env.VITE_SERVER_URL as string | undefined;
    // auth уходит в handshake — сервер проверяет его middleware ещё до подключения.
    const options = { transports: ['websocket'], auth: { sessionId: getSessionId() } };
    this.socket = url ? io(url, options) : io(options);

    this.socket.on('connect', () => this.setStatus('connecting', 'handshake…'));
    this.socket.on('net:welcome', (welcome) => this.onWelcome(welcome));
    this.socket.on('room:state', (room) => this.emit('roomState', room));
    this.socket.on('world:snapshot', (snapshot) => this.emit('snapshot', snapshot));
    this.socket.on('player:teleport', (position) => this.emit('teleport', position));
    this.socket.on('seek:shot', (shot) => this.emit('shot', shot));
    this.socket.on('disconnect', (reason) => {
      clearInterval(this.pingTimer);
      // Сервер отключил нас сам — значит, эта же сессия открылась в другой вкладке.
      // socket.io в этом случае не переподключается автоматически, и это правильно.
      if (reason === 'io server disconnect') {
        this.setStatus('offline', 'opened in another tab');
      } else {
        this.setStatus('offline', 'offline, reconnecting…');
      }
    });
    this.socket.on('connect_error', () => this.setStatus('offline', 'server unreachable'));
  }

  createRoom(payload: CreateRoomPayload): Promise<RoomResult> {
    return withTimeoutFallback(this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('room:create', payload));
  }

  joinRoom(payload: JoinRoomPayload): Promise<RoomResult> {
    return withTimeoutFallback(this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('room:join', payload));
  }

  startGame(): Promise<EmptyResult> {
    return withTimeoutFallback(this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('game:start'));
  }

  updateSettings(payload: UpdateSettingsPayload): Promise<EmptyResult> {
    return withTimeoutFallback(this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('room:settings', payload));
  }

  paint(payload: PaintPayload): Promise<EmptyResult> {
    return withTimeoutFallback(this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('player:paint', payload));
  }

  shoot(payload: ShootPayload): Promise<Result<ShotResult>> {
    return withTimeoutFallback(this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('seek:shoot', payload));
  }

  leaveRoom(): void {
    this.socket.emit('room:leave');
  }

  /**
   * volatile: если соединения нет или буфер забит — пакет выбрасывается.
   * Устаревшая позиция бесполезна, через 50 мс уйдёт свежая.
   */
  sendPlayerState(state: PlayerState): void {
    this.socket.volatile.emit('player:state', state);
  }

  private onWelcome(welcome: WelcomePayload) {
    if (welcome.protocolVersion !== PROTOCOL_VERSION) {
      this.setStatus('offline', 'outdated client');
      this.socket.disconnect();
      this.emit('outdated', undefined);
      return;
    }
    this.playerId = welcome.playerId;
    this.setStatus('online', `online · ${welcome.playerId.slice(0, 6)}`);
    this.measurePing();
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.measurePing(), PING_INTERVAL_MS);
    this.emit('welcome', welcome);
  }

  private measurePing() {
    this.socket.emit('net:ping', { clientTime: performance.now() }, (pong) => {
      const now = performance.now();
      this.clock.addSample(pong.clientTime, pong.serverTime, now);
      this.emit('ping', now - pong.clientTime);
    });
  }

  private setStatus(state: ConnectionState, text: string) {
    this.state = state;
    this.emit('status', { state, text });
  }
}

/** emitWithAck с timeout бросает ошибку, если сервер молчит. Превращаем её в обычный Result. */
async function withTimeoutFallback<T>(request: Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await request;
  } catch {
    return { ok: false, error: 'TIMEOUT' };
  }
}
