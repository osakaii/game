/**
 * Сетевой протокол игры. Единственный источник правды о том,
 * какие события ходят между клиентом и сервером и что в них лежит.
 *
 * Меняешь формат сообщений — увеличивай PROTOCOL_VERSION,
 * чтобы старый клиент не пытался говорить с новым сервером.
 */
import type { CreateRoomPayload, EmptyResult, JoinRoomPayload, RoomResult, RoomSnapshot } from './lobby.js';
import type { PlayerState, TeleportPayload, WorldSnapshot } from './net-state.js';
import type { PaintPayload } from './body.js';

export const PROTOCOL_VERSION = 5;

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
  /** Состояние комнаты изменилось (кто-то зашёл, вышел, сменился хост). */
  'room:state': (room: RoomSnapshot) => void;
  'world:snapshot': (snapshot: WorldSnapshot) => void;
  'player:teleport': (position: TeleportPayload) => void;
}

export interface ClientToServerEvents {
  'net:ping': (payload: PingPayload, ack: (pong: PongPayload) => void) => void;
  'room:create': (payload: CreateRoomPayload, ack: (result: RoomResult) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (result: RoomResult) => void) => void;
  'room:leave': () => void;
  'player:state': (state: PlayerState) => void;
  /** Только хост, только в лобби. */
  'game:start': (ack: (result: EmptyResult) => void) => void;
  'player:paint': (payload: PaintPayload, ack: (result: EmptyResult) => void) => void;
}
