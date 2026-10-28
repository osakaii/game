import { io, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  type ClientReport,
  type ClientToServerEvents,
  type CreateRoomPayload,
  type EmptyResult,
  type HintPing,
  type JoinRoomPayload,
  type PlayerState,
  type Result,
  type RoomResult,
  type RoomSnapshot,
  type ServerToClientEvents,
  type ShootPayload,
  type ShotEvent,
  type ShotResult,
  type SkinImageEvent,
  type UpdateSettingsPayload,
  type TeleportPayload,
  type WelcomePayload,
  type WorldSnapshot,
} from '@mecha/shared';
import { Emitter } from '../core/emitter';
import { LinkWatchdog } from './link-watchdog';
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
  hint: HintPing;
  skin: SkinImageEvent;
  /** Протокол сервера несовместим с этим клиентом — нужна перезагрузка. */
  outdated: void;
}

const PING_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;
/** Картинка кожи весит до сотен КБ — на медленном мобильном интернете ей нужно больше времени. */
const UPLOAD_TIMEOUT_MS = 15000;

/**
 * Обёртка над socket.io: соединение, пинг и запросы.
 * Остальной код не знает про сокеты — только про методы и события Network.
 */
export class Network extends Emitter<NetworkEvents> {
  private readonly socket: GameSocket;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  readonly clock = new ServerClock();
  private readonly watchdog = new LinkWatchdog();
  playerId: string | null = null;
  state: ConnectionState = 'connecting';
  /** Когда запущен сервер, к которому мы подключены (из welcome). */
  serverStartedAt: number | null = null;

  constructor() {
    super();
    // Без URL socket.io подключится к текущему origin (в dev его проксирует Vite).
    const url = import.meta.env.VITE_SERVER_URL as string | undefined;
    // auth уходит в handshake — сервер проверяет его middleware ещё до подключения.
    const options = { transports: ['websocket'], auth: { sessionId: getSessionId() } };
    this.socket = url ? io(url, options) : io(options);

    this.socket.on('connect', () => this.setStatus('connecting', 'подключаемся…'));
    this.socket.on('net:welcome', (welcome) => this.onWelcome(welcome));
    this.socket.on('room:state', (room) => this.emit('roomState', room));
    this.socket.on('world:snapshot', (snapshot) => this.emit('snapshot', snapshot));
    this.socket.on('player:teleport', (position) => this.emit('teleport', position));
    this.socket.on('seek:shot', (shot) => this.emit('shot', shot));
    this.socket.on('hint:ping', (ping) => this.emit('hint', ping));
    this.socket.on('player:skin', (skin) => this.emit('skin', skin));
    this.socket.on('disconnect', (reason) => {
      clearInterval(this.pingTimer);
      // Сервер отключил нас сам — значит, эта же сессия открылась в другой вкладке.
      // socket.io в этом случае не переподключается автоматически, и это правильно.
      if (reason === 'io server disconnect') {
        this.setStatus('offline', 'игра открыта в другой вкладке');
      } else {
        this.setStatus('offline', 'нет связи, переподключаемся…');
      }
    });
    this.socket.on('connect_error', () => this.setStatus('offline', 'сервер недоступен'));

    // Вернулись во вкладку (телефон разблокировали, вышли из мессенджера). Ждать, пока socket.io
    // сам попробует переподключиться (до 5 с паузы между попытками), незачем — подключаемся сразу.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!this.socket.connected) {
        this.socket.connect();
        return;
      }
      // Сокет «вроде жив», но за время в фоне связь могла умереть: проверяем свежим пингом,
      // а сторожу даём начать отсчёт заново — иначе он счёл бы мёртвым всё, что было в фоне.
      this.watchdog.alive(performance.now());
      this.measurePing();
    });
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

  /** Бинарные данные socket.io передаёт как есть, без JSON и base64 — на треть меньше трафика. */
  uploadSkin(image: ArrayBuffer): Promise<Result<{ revision: number }>> {
    return withTimeoutFallback(this.socket.timeout(UPLOAD_TIMEOUT_MS).emitWithAck('player:skin', image));
  }

  shoot(payload: ShootPayload): Promise<Result<ShotResult>> {
    return withTimeoutFallback(this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('seek:shoot', payload));
  }

  /** Телеметрия: обычный emit, не volatile — ошибка, случившаяся без связи, уйдёт после переподключения. */
  report(report: ClientReport): void {
    this.socket.emit('client:report', report);
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
      this.setStatus('offline', 'нужно обновить страницу');
      this.socket.disconnect();
      this.emit('outdated', undefined);
      return;
    }
    this.playerId = welcome.playerId;
    // Другой процесс сервера — другие часы: смещение считаем заново.
    if (this.serverStartedAt !== null && this.serverStartedAt !== welcome.serverStartedAt) this.clock.reset();
    this.serverStartedAt = welcome.serverStartedAt;
    this.setStatus('online', `в сети · ${welcome.playerId.slice(0, 6)}`);
    this.watchdog.alive(performance.now());
    this.measurePing();
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.checkLink(), PING_INTERVAL_MS);
    this.emit('welcome', welcome);
  }

  /** Раз в PING_INTERVAL_MS: связь молчит слишком долго — переподключаемся, иначе — очередной пинг. */
  private checkLink() {
    // В фоне браузер тормозит таймеры, ответы приходят пачками — там не судим (см. visibilitychange).
    if (document.visibilityState === 'visible' && this.state === 'online' && this.watchdog.isDead(performance.now())) {
      this.reconnect();
      return;
    }
    this.measurePing();
  }

  /** Бросить молчащее соединение и открыть новое. Сервер узнает нас по sessionId и вернёт на место. */
  private reconnect() {
    clearInterval(this.pingTimer);
    this.setStatus('offline', 'нет связи, переподключаемся…');
    this.socket.disconnect();
    this.socket.connect();
  }

  private measurePing() {
    this.socket.emit('net:ping', { clientTime: performance.now() }, (pong) => {
      const now = performance.now();
      this.watchdog.alive(now);
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
