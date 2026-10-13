import { z } from 'zod';
import type { GameResult, Role, RoomPhase } from './game.js';

export const MAX_PLAYERS = 8;
export const NICKNAME_MAX_LENGTH = 16;
export const ROOM_CODE_LENGTH = 4;
/** Без похожих символов (0/O, 1/I/L): код диктуют голосом и набирают на телефоне. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Схемы zod — одновременно валидация в рантайме и TypeScript-типы.
 * Сервер проверяет ими всё, что пришло из сети: клиенту доверять нельзя,
 * его код можно подменить в DevTools. Клиент той же схемой проверяет форму до отправки.
 */
export const NicknameSchema = z
  .string()
  .trim()
  .min(1, 'Введите ник')
  .max(NICKNAME_MAX_LENGTH, `Ник длиннее ${NICKNAME_MAX_LENGTH} символов`)
  // \p{C} — управляющие и невидимые символы Unicode: ими можно сломать вёрстку или выдать себя за другого.
  .regex(/^[^\p{C}]+$/u, 'Недопустимые символы в нике');

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH, `Код — ${ROOM_CODE_LENGTH} символа`)
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`), 'Неверный код комнаты');

export const CreateRoomSchema = z.object({ nickname: NicknameSchema });
export const JoinRoomSchema = z.object({ nickname: NicknameSchema, code: RoomCodeSchema });

/** z.input — тип ДО трансформаций (то, что шлёт клиент), z.output — после (что получает сервер). */
export type CreateRoomPayload = z.input<typeof CreateRoomSchema>;
export type JoinRoomPayload = z.input<typeof JoinRoomSchema>;

export interface PlayerInfo {
  id: string;
  nickname: string;
  /** null — в лобби, роли раздаются при старте раунда. */
  role: Role | null;
  /** Прячущегося нашли (этап 6). */
  found: boolean;
}

/** Снимок комнаты, который сервер рассылает всем её участникам при любом изменении. */
export interface RoomSnapshot {
  code: string;
  hostId: string;
  maxPlayers: number;
  phase: RoomPhase;
  /** Когда закончится текущая фаза (серверное время, мс). null — фаза без таймера (лобби). */
  phaseEndsAt: number | null;
  /** Итог последнего раунда — заполнен в фазе results. */
  result: GameResult | null;
  players: PlayerInfo[];
}

export const ERROR_CODES = [
  'INVALID_INPUT',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'GAME_IN_PROGRESS',
  'ALREADY_IN_ROOM',
  'NOT_HOST',
  'NOT_ENOUGH_PLAYERS',
  'INTERNAL',
  /** Клиентская ошибка: сервер не ответил вовремя. */
  'TIMEOUT',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Ответ на запрос: либо успех с данными, либо код ошибки. TypeScript сужает тип по полю ok. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message?: string };

export type RoomResult = Result<RoomSnapshot>;
export type EmptyResult = Result<null>;
