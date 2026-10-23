import { PLAYER, bodyHeight, moveSpeed, penetratesColliders, type MapDef, type PlayerState, type Aabb } from '@mecha/shared';

/**
 * Насколько щедро прощаем расхождения. Сеть неровная: пакеты приходят пачками,
 * таймеры у клиента и сервера тикают не синхронно. Слишком строго — честные игроки
 * будут дёргаться от откатов. Слишком мягко — читер получит прибавку к скорости.
 */
const SPEED_TOLERANCE = 1.25;
const DISTANCE_SLACK = 0.35; // м — постоянный запас на джиттер
const MAX_ELAPSED_S = 1; // долгая пауза не даёт «накопить» право на телепорт через полкарты
const WALL_TOLERANCE = 0.1;

export type MoveVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Бюджет расстояния: сколько метров игрок ещё вправе пройти. Копится со временем со скоростью
 * движения (с допуском) и тратится пройденным. Предел — секунда движения плюс запас на джиттер.
 *
 * Раньше запас на джиттер давался к КАЖДОМУ пакету: при 20 пакетах в секунду это +7 м/с сверху,
 * и «шагом» можно было идти 13 м/с. Бюджет даёт тот же запас один раз: пачка пакетов после
 * подвисания сети проходит (бюджет накопился за паузу), а долгая скорость ограничена честно.
 */
export interface MoveBudget {
  meters: number;
}

/** Бюджет нового игрока или после телепорта: только запас на джиттер. */
export function freshBudget(): MoveBudget {
  return { meters: DISTANCE_SLACK };
}

/**
 * Проверка «мог ли честный клиент оказаться в next, если раньше был в prev».
 * Сравниваем с ПОСЛЕДНЕЙ ПРИНЯТОЙ позицией и временем её приёма,
 * поэтому частота пакетов не важна: хоть 100 пакетов в секунду — быстрее не побежишь.
 */
export function validateMove(
  prev: PlayerState,
  next: PlayerState,
  elapsedMs: number,
  map: MapDef,
  colliders: Aabb[],
  budget: MoveBudget = freshBudget(),
): MoveVerdict {
  const dt = Math.min(Math.max(elapsedMs, 0) / 1000, MAX_ELAPSED_S);

  const halfW = map.width / 2;
  const halfD = map.depth / 2;
  if (Math.abs(next.x) > halfW || Math.abs(next.z) > halfD || next.y < -0.05 || next.y > 20) {
    return { ok: false, reason: 'out of bounds' };
  }

  // Скорость — по положению тела: ползком медленнее, в позе «на месте» — только запас на джиттер.
  // Берём большую из двух: поза могла смениться между пакетами (шёл → лёг).
  const horizontal = Math.hypot(next.x - prev.x, next.z - prev.z);
  const speed = Math.max(moveSpeed(prev), moveSpeed(next)) * SPEED_TOLERANCE;
  const allowance = Math.min(budget.meters + speed * dt, speed * MAX_ELAPSED_S + DISTANCE_SLACK);
  if (horizontal > allowance) {
    return { ok: false, reason: `too fast: ${horizontal.toFixed(2)} m in ${dt.toFixed(3)} s` };
  }

  const up = next.y - prev.y;
  const maxUp = PLAYER.jumpSpeed * SPEED_TOLERANCE * dt + PLAYER.stepHeight + DISTANCE_SLACK;
  const maxDown = PLAYER.maxFallSpeed * SPEED_TOLERANCE * dt + DISTANCE_SLACK;
  if (up > maxUp || -up > maxDown) {
    return { ok: false, reason: `vertical speed: ${up.toFixed(2)} m` };
  }

  // Высота — по заявленному состоянию: «стою» внутри столешницы — отказ, «сижу» или «лежу» под ней — можно.
  if (penetratesColliders(next, colliders, WALL_TOLERANCE, bodyHeight(next))) {
    return { ok: false, reason: 'inside wall' };
  }

  // Тратим бюджет только у принятого движения: отклонённое игрок не прошёл.
  budget.meters = allowance - horizontal;
  return { ok: true };
}
