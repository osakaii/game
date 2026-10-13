/**
 * Сетевой протокол игры. Единственный источник правды о том,
 * какие события ходят между клиентом и сервером и что в них лежит.
 *
 * Меняешь формат сообщений — увеличивай PROTOCOL_VERSION,
 * чтобы старый клиент не пытался говорить с новым сервером.
 */
export const PROTOCOL_VERSION = 1;

/** Сервер -> клиент: сразу после подключения. */
export interface WelcomePayload {
  playerId: string;
  protocolVersion: number;
  serverTime: number;
}

/** Клиент -> сервер: замер задержки. */
export interface PingPayload {
  clientTime: number;
}

/** Ответ на ping (приходит в ack-колбэк, а не отдельным событием). */
export interface PongPayload {
  clientTime: number;
  serverTime: number;
}

/**
 * Карты событий для типизированного socket.io.
 * Ключ — имя события, значение — сигнатура обработчика.
 * Префикс `net:` — группа событий (дальше будут `room:`, `game:`).
 * Плюс не путаем с внутренним heartbeat socket.io.
 */
export interface ServerToClientEvents {
  'net:welcome': (payload: WelcomePayload) => void;
}

export interface ClientToServerEvents {
  'net:ping': (payload: PingPayload, ack: (pong: PongPayload) => void) => void;
}
