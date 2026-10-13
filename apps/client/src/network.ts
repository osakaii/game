import { io, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@mecha/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Status = 'connecting' | 'online' | 'offline';

interface NetworkHandlers {
  onStatus(state: Status, text: string): void;
  onPing(rttMs: number): void;
}

const PING_INTERVAL_MS = 2000;

export function connect(handlers: NetworkHandlers): GameSocket {
  // Без URL socket.io подключится к текущему origin (в dev его проксирует Vite).
  // VITE_SERVER_URL пригодится в проде, если сервер живёт на другом домене.
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const socket: GameSocket = url
    ? io(url, { transports: ['websocket'] })
    : io({ transports: ['websocket'] });

  let pingTimer: ReturnType<typeof setInterval> | undefined;

  function measurePing() {
    socket.emit('net:ping', { clientTime: performance.now() }, (pong) => {
      handlers.onPing(performance.now() - pong.clientTime);
    });
  }

  socket.on('connect', () => handlers.onStatus('connecting', 'handshake…'));

  socket.on('net:welcome', (welcome) => {
    if (welcome.protocolVersion !== PROTOCOL_VERSION) {
      handlers.onStatus('offline', 'version mismatch, reload page');
      socket.disconnect();
      return;
    }
    handlers.onStatus('online', `online · ${welcome.playerId.slice(0, 6)}`);
    measurePing();
    pingTimer = setInterval(measurePing, PING_INTERVAL_MS);
  });

  socket.on('disconnect', () => {
    clearInterval(pingTimer);
    handlers.onStatus('offline', 'offline, reconnecting…');
  });

  socket.on('connect_error', () => handlers.onStatus('offline', 'server unreachable'));

  return socket;
}
