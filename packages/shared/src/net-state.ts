import { z } from 'zod';

/** Сколько раз в секунду клиент шлёт свою позицию. */
export const CLIENT_STATE_RATE = 20;
/** Сколько раз в секунду сервер рассылает снимок мира. */
export const SNAPSHOT_RATE = 20;
/**
 * Чужих игроков рисуем «в прошлом» на эту задержку. 100 мс = два снимка при 20 Гц:
 * почти всегда есть точка «до» и «после», между которыми можно интерполировать.
 */
export const INTERPOLATION_DELAY_MS = 100;

/** Состояние, которое клиент сообщает о себе. z.number() в zod 4 уже отбрасывает NaN и Infinity. */
export const PlayerStateSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  yaw: z.number(),
  grounded: z.boolean(),
  crouching: z.boolean(),
});
export type PlayerState = z.output<typeof PlayerStateSchema>;

export interface NetPlayer extends PlayerState {
  id: string;
}

/** Снимок мира: где все игроки комнаты в момент t (серверное время, мс). */
export interface WorldSnapshot {
  t: number;
  players: NetPlayer[];
}

/** Сервер ставит игрока в точку: спавн или откат нечестного перемещения. */
export interface TeleportPayload {
  x: number;
  y: number;
  z: number;
}

/** Округление до сантиметра: короче JSON, а глазу разницы нет. */
export function roundCm(value: number): number {
  return Math.round(value * 100) / 100;
}

const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

/** Ищущий проверяет место: луч из камеры через точку касания. */
export const ShootSchema = z.object({ origin: Vec3Schema, dir: Vec3Schema });
export type ShootPayload = z.input<typeof ShootSchema>;

export interface ShotResult {
  hitPlayerId: string | null;
  /** Куда попал луч (стена, пол, игрок). null — слишком далеко. */
  point: { x: number; y: number; z: number } | null;
  /** Когда можно проверять снова (серверное время, мс). */
  nextShotAt: number;
}

/** Рассылается всей комнате: прячущиеся видят, куда тыкают ищущие. */
export interface ShotEvent {
  seekerId: string;
  hitPlayerId: string | null;
  point: { x: number; y: number; z: number } | null;
}
