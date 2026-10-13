import { PLAYER, penetratesColliders, type MapDef, type PlayerState, type Aabb } from '@mecha/shared';

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
): MoveVerdict {
  const dt = Math.min(Math.max(elapsedMs, 0) / 1000, MAX_ELAPSED_S);

  const halfW = map.width / 2;
  const halfD = map.depth / 2;
  if (Math.abs(next.x) > halfW || Math.abs(next.z) > halfD || next.y < -0.05 || next.y > 20) {
    return { ok: false, reason: 'out of bounds' };
  }

  const horizontal = Math.hypot(next.x - prev.x, next.z - prev.z);
  if (horizontal > PLAYER.walkSpeed * SPEED_TOLERANCE * dt + DISTANCE_SLACK) {
    return { ok: false, reason: `too fast: ${horizontal.toFixed(2)} m in ${dt.toFixed(3)} s` };
  }

  const up = next.y - prev.y;
  const maxUp = PLAYER.jumpSpeed * SPEED_TOLERANCE * dt + PLAYER.stepHeight + DISTANCE_SLACK;
  const maxDown = PLAYER.maxFallSpeed * SPEED_TOLERANCE * dt + DISTANCE_SLACK;
  if (up > maxUp || -up > maxDown) {
    return { ok: false, reason: `vertical speed: ${up.toFixed(2)} m` };
  }

  if (penetratesColliders(next, colliders, WALL_TOLERANCE)) {
    return { ok: false, reason: 'inside wall' };
  }

  return { ok: true };
}
