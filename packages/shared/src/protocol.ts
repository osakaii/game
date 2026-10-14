/**
 * Сетевой протокол игры. Единственный источник правды о том,
 * какие события ходят между клиентом и сервером и что в них лежит.
 *
 * Меняешь формат сообщений — увеличивай PROTOCOL_VERSION,
 * чтобы старый клиент не пытался говорить с новым сервером.
 *
 * PROTOCOL_VERSION и APP_VERSION (version.ts) — разные вещи:
 *   APP_VERSION — для людей: что нового в игре;
 *   PROTOCOL_VERSION — для кода: могут ли клиент и сервер понять друг друга.
 * Новая карта меняет APP_VERSION, но не протокол. Новое поле в сообщении — меняет оба.
 */
import { z } from 'zod';
import type { PaintPayload } from './body.js';
import type { UpdateSettingsPayload } from './settings.js';
import type { BuildInfo } from './version.js';
import type {
  CreateRoomPayload,
  EmptyResult,
  JoinRoomPayload,
  Result,
  RoomResult,
  RoomSnapshot,
} from './lobby.js';
import type {
  PlayerState,
  ShootPayload,
  ShotEvent,
  ShotResult,
  TeleportPayload,
  WorldSnapshot,
} from './net-state.js';

export const PROTOCOL_VERSION = 10;

/**
 * Секрет сессии, клиент генерирует его сам и передаёт при подключении (handshake auth).
 * Знает только этот клиент и сервер — по нему сервер узнаёт игрока после переподключения.
 */
export const SessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** Сервер -> клиент: сразу после подключения. */
export interface WelcomePayload {
  /** Публичный постоянный id игрока (не меняется при переподключении). */
  playerId: string;
  protocolVersion: number;
  serverTime: number;
  /** Комната, в которой игрок всё ещё состоит после переподключения. null — ни в какой. */
  roomCode: string | null;
  /** Какая сборка на сервере — клиент сравнит со своей и предложит обновиться. */
  build: BuildInfo;
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
  'seek:shot': (shot: ShotEvent) => void;
}

export interface ClientToServerEvents {
  'net:ping': (payload: PingPayload, ack: (pong: PongPayload) => void) => void;
  'room:create': (payload: CreateRoomPayload, ack: (result: RoomResult) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (result: RoomResult) => void) => void;
  'room:leave': () => void;
  'player:state': (state: PlayerState) => void;
  /** Только хост, только в лобби. */
  'game:start': (ack: (result: EmptyResult) => void) => void;
  /** Только хост, только в лобби. */
  'room:settings': (payload: UpdateSettingsPayload, ack: (result: EmptyResult) => void) => void;
  'player:paint': (payload: PaintPayload, ack: (result: EmptyResult) => void) => void;
  'seek:shoot': (payload: ShootPayload, ack: (result: Result<ShotResult>) => void) => void;
}
