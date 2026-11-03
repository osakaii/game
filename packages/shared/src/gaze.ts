import { vec3, type Vec3 } from './math.js';
import type { Look } from './net-state.js';
import { PLAYER, bodyHeight, type BodyStance } from './physics.js';
import { rayToWorld } from './raycast.js';
import type { Aabb } from './world/map.js';

/**
 * Очки за взгляд, как в Meccha Chameleon: чем дольше ищущий смотрит прямо на прячущегося
 * и не замечает его, тем больше очков прячущемуся. Выгодно прятаться смело, на виду, а не в углу.
 *
 * Считает сервер по своим позициям: клиент ищущего сообщает только, куда смотрит камера.
 */
export const GAZE_RULES = {
  /** «Смотрит» — прячущийся в пределах стольких градусов от центра экрана. */
  coneDegrees: 15,
  /** Дальше этого (м) — мелкая фигурка вдали, а не «смотрел в упор». */
  range: 25,
  /** Как часто сервер проверяет взгляды (мс). */
  tickMs: 100,
  /** Столько мс под взглядом — одно очко. */
  msPerPoint: 2000,
  /** Больше за раунд не дают: ищущий-приятель не «накрутит» очки, нарочно глядя на друга. */
  maxPoints: 10,
} as const;

/** Камера ищущего висит над ним на высоте плеч, в приседе и лёжа — ниже (как ThirdPersonCamera). */
const EYE_HEIGHT = 1.35;
const EYE_HEIGHT_LOW = 0.75;
/**
 * Луч к точке тела может задеть то, к чему прячущийся прижался со стороны ищущего (край стола):
 * помеха ближе этого к точке — не загораживает. Стена толще, её дальняя грань дальше.
 */
const BODY_SLACK = PLAYER.radius + 0.05;
/**
 * Где на теле проверяем видимость — доли роста: ноги, середина, голова. Одной середины мало:
 * стоящий за столом по пояс виден по плечи, а луч к поясу упрётся в столешницу.
 */
const BODY_SAMPLES = [0.2, 0.5, 0.85];
const COS_CONE = Math.cos((GAZE_RULES.coneDegrees * Math.PI) / 180);

/** Направление взгляда камеры: камера смотрит из-за спины на игрока, «вперёд» — от неё к нему. */
export function lookDirection(look: Look): Vec3 {
  const cos = Math.cos(look.pitch);
  return vec3(-Math.sin(look.yaw) * cos, -Math.sin(look.pitch), -Math.cos(look.yaw) * cos);
}

export interface GazeSeeker extends BodyStance {
  x: number;
  y: number;
  z: number;
  look?: Look;
}

export interface GazeTarget extends BodyStance {
  x: number;
  y: number;
  z: number;
}

/**
 * Смотрит ли ищущий на прячущегося: хоть одна точка тела (ноги, середина, голова) в конусе у центра
 * экрана, не дальше range, и между ней и глазами нет стены. Без look (старый клиент) — не смотрит.
 */
export function isWatching(seeker: GazeSeeker, hider: GazeTarget, colliders: readonly Aabb[]): boolean {
  if (!seeker.look) return false;
  const eye = vec3(seeker.x, seeker.y + (bodyHeight(seeker) < 1.2 ? EYE_HEIGHT_LOW : EYE_HEIGHT), seeker.z);
  const forward = lookDirection(seeker.look);
  const height = bodyHeight(hider);
  return BODY_SAMPLES.some((share) => {
    const dx = hider.x - eye.x;
    const dy = hider.y + height * share - eye.y;
    const dz = hider.z - eye.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > GAZE_RULES.range) return false;
    if (distance < 0.01) return true;
    const dir = vec3(dx / distance, dy / distance, dz / distance);
    if (dir.x * forward.x + dir.y * forward.y + dir.z * forward.z < COS_CONE) return false;
    return rayToWorld(eye, dir, colliders, distance) >= distance - BODY_SLACK;
  });
}

/** Очки за накопленное время под взглядом. */
export function gazePoints(watchedMs: number): number {
  return Math.min(GAZE_RULES.maxPoints, Math.floor(watchedMs / GAZE_RULES.msPerPoint));
}

/** Личное событие прячущемуся: смотрят ли на него сейчас и сколько очков за взгляды набрано. */
export interface GazeUpdate {
  watched: boolean;
  points: number;
}
