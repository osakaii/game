import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@mecha/shared';

/** Данные, которые сервер хранит на каждом сокете (socket.data). */
export interface SocketData {
  /** Публичный постоянный id игрока — его видят другие. */
  playerId: string;
  /** Секрет сессии — знают только этот клиент и сервер. */
  sessionId: string;
  /** Токен-бакеты ограничителя частоты, по одному на событие. */
  rateBuckets?: Record<string, { tokens: number; updatedAt: number }>;
}

// Третий параметр — события между серверами (для кластера), у нас их нет.
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** id игрока, привязанный к сокету при подключении (см. NetGateway). */
export function playerIdOf(client: GameSocket): string {
  return client.data.playerId;
}

/**
 * Личная socket.io-комната игрока. Через неё шлём сообщения одному игроку,
 * не зная его текущий socket.id (он меняется при переподключении).
 */
export function playerRoom(playerId: string): string {
  return `player:${playerId}`;
}

/**
 * Все gateway висят на одном socket.io-сервере. Опции у них должны совпадать,
 * поэтому держим их в одном месте.
 *
 * CORS: в продакшене клиент раздаётся тем же сервером (один origin), CORS не нужен.
 * Если клиент живёт на другом домене — укажите его в CORS_ORIGIN.
 */
export const GATEWAY_OPTIONS = {
  cors: { origin: process.env.CORS_ORIGIN ?? (process.env.NODE_ENV === 'production' ? false : true) },
};
