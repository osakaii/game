import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@mecha/shared';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Все gateway висят на одном socket.io-сервере. Опции у них должны совпадать,
 * поэтому держим их в одном месте.
 */
export const GATEWAY_OPTIONS = { cors: { origin: true } };
