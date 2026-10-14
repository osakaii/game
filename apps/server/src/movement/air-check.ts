import { JUMP_HEIGHT, supportHeight, type Aabb, type PlayerState } from '@mecha/shared';

/**
 * Защита от «полётов». validateMove проверяет скорость, но не гравитацию:
 * подделанными пакетами можно было бы висеть в воздухе сколько угодно.
 *
 * Сервер следит, как долго игрок над опорой и насколько поднялся от точки отрыва.
 * Честный прыжок — меньше секунды и не выше JUMP_HEIGHT (~1.28 м).
 */
export interface AirState {
  /** Серверное время отрыва от опоры. null — стоит на опоре. */
  since: number | null;
  /** Высота опоры, с которой оторвался. */
  takeoffY: number;
}

/** Прыжок с самой высокой точки карты и падение до пола — около секунды. Запас на джиттер сети. */
const MAX_AIRTIME_MS = 2000;
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

  air.since ??= now;
  if (now - air.since > MAX_AIRTIME_MS) return { ok: false, reason: 'airborne too long' };
  if (next.y > air.takeoffY + JUMP_HEIGHT + RISE_SLACK) {
    return { ok: false, reason: `too high: ${(next.y - air.takeoffY).toFixed(2)} m above takeoff` };
  }
  return { ok: true };
}
