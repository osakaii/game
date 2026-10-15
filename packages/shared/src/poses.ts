import { z } from 'zod';

/**
 * Позы прячущегося. Силуэт выдаёт сильнее цвета — поэтому поза меняет не только вид,
 * но и физику: высоту тела (можно залечь под кровать) и скорость (в низких позах — ползком).
 *
 * 'none' — обычное состояние: стоит или присел (присед — отдельный переключатель).
 */
export const POSES = ['flat', 'crawl', 'ball', 'handsUp', 'sit', 'statue'] as const;
export type PoseId = (typeof POSES)[number];
export type Pose = PoseId | 'none';

export const PoseSchema = z.enum(['none', ...POSES]);

export interface PoseRule {
  /** Высота тела (м) — для столкновений с потолком и для хитбокса. */
  height: number;
  /** Скорость ползком (м/с). 0 — поза «на месте»: движение или прыжок из неё выводят. */
  speed: number;
}

/** Высоты сверены с моделью: макушка (или поднятые руки) не выше height — это проверяет тест модели. */
export const POSE_RULES: Record<PoseId, PoseRule> = {
  flat: { height: 0.5, speed: 0.9 },
  crawl: { height: 0.8, speed: 1.6 },
  ball: { height: 0.95, speed: 0 },
  handsUp: { height: 1.6, speed: 0 },
  sit: { height: 1.1, speed: 0 },
  statue: { height: 1.6, speed: 0 },
};

/** Меньше этой длины ввод джойстика — дрожание пальца, а не желание идти. */
export const MOVE_DEADZONE = 0.15;

/** Прыжок снимает любую позу, движение — позу «на месте» (ползком двигаться можно). */
export function cancelsPose(pose: Pose, input: { dirX: number; dirZ: number; jump: boolean }): boolean {
  if (pose === 'none') return false;
  if (input.jump) return true;
  return POSE_RULES[pose].speed === 0 && Math.hypot(input.dirX, input.dirZ) > MOVE_DEADZONE;
}
