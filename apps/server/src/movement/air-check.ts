import { JUMP_HEIGHT, PLAYER, bodyHeight, supportHeight, wallContact, type Aabb, type PlayerState } from '@mecha/shared';

/**
 * Защита от «полётов». validateMove проверяет скорость, но не гравитацию:
 * подделанными пакетами можно было бы висеть в воздухе сколько угодно.
 *
 * Сервер следит, как долго игрок над опорой и насколько поднялся от точки отрыва.
 * Честный прыжок — меньше секунды и не выше JUMP_HEIGHT (~1.28 м). Падение с высоты, куда игрок
 * влез (флагшток — 43 м), длится дольше: к пределу добавляется время падения с точки отрыва.
 */
export interface AirState {
  /** Серверное время отрыва от опоры. null — стоит на опоре. */
  since: number | null;
  /** Высота опоры, с которой оторвался. */
  takeoffY: number;
}

/** Прыжок и падение с небольшой высоты — около секунды. Запас на джиттер сети. */
const MAX_AIRTIME_MS = 2000;
/** Высота, на которой падение разгоняется до предельной скорости. */
const TERMINAL_DROP = (PLAYER.maxFallSpeed * PLAYER.maxFallSpeed) / (2 * PLAYER.gravity);

/** Сколько мс честно падать с высоты drop (м): разгон с ускорением, дальше — с предельной скоростью. */
export function fallMs(drop: number): number {
  if (drop <= 0) return 0;
  if (drop <= TERMINAL_DROP) return Math.sqrt((2 * drop) / PLAYER.gravity) * 1000;
  return (PLAYER.maxFallSpeed / PLAYER.gravity + (drop - TERMINAL_DROP) / PLAYER.maxFallSpeed) * 1000;
}
/** Насколько выше опоры считается «стоит»: ступеньки, округление до сантиметра. */
const GROUND_EPS = 0.15;
const RISE_SLACK = 0.35;

export type AirVerdict = { ok: true } | { ok: false; reason: string };

/** Мутирует air. Вызывать только для позиций, уже прошедших validateMove. */
export function checkAirborne(air: AirState, next: PlayerState, colliders: readonly Aabb[], now: number): AirVerdict {
  const ground = supportHeight(next, colliders);
  if (next.y - ground <= GROUND_EPS) {
    air.since = null;
    air.takeoffY = ground;
    return { ok: true };
  }
  // Висит на стене или лезет по ней — это не полёт. Проверяем сами по геометрии, слову клиента не верим:
  // в чистом воздухе стены рядом нет, и «полёт» поймается как раньше. Прыжок от стены считаем от этой высоты.
  if (wallContact(next, colliders, bodyHeight(next))) {
    air.since = null;
    air.takeoffY = next.y;
    return { ok: true };
  }

  air.since ??= now;
  if (now - air.since > MAX_AIRTIME_MS + fallMs(air.takeoffY - ground)) return { ok: false, reason: 'airborne too long' };
  if (next.y > air.takeoffY + JUMP_HEIGHT + RISE_SLACK) {
    return { ok: false, reason: `too high: ${(next.y - air.takeoffY).toFixed(2)} m above takeoff` };
  }
  return { ok: true };
}
