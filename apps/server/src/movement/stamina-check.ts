import { STAMINA, tickStamina, type PlayerState, type StaminaState } from '@mecha/shared';

/**
 * Сервер тратит выносливость чуть медленнее клиента. Часы клиента и сервера тикают неровно,
 * пакеты приходят пачками: при одинаковом расходе у сервера силы иногда кончались бы на долю
 * секунды раньше, и честного бегуна дёргало бы откатом. 15% запаса — не прибавка читеру:
 * бесконечного бега всё равно не получить.
 */
const SERVER_DRAIN = 0.85;
/** Долгая пауза между пакетами не должна разом «вылечить» усталость или списать весь запас. */
const MAX_STEP_S = 1;

/**
 * Бег клиента принимаем, только если у сервера (а не у клиента) остались силы.
 * Возвращает состояние, по которому проверять скорость: силы кончились — как будто идёт шагом,
 * и тогда скорость бега validateMove отклонит.
 */
export function judgeSprint(stamina: StaminaState, next: PlayerState, endless = false): PlayerState {
  // Помощник ищущих мог стать им уставшим: серверный запас наполнится только в recordSprint.
  if (!next.sprinting || endless) return next;
  const left = stamina.stamina ?? 1;
  const allowed = stamina.sprinting ? left > 0 : left >= STAMINA.minToStart * SERVER_DRAIN;
  return allowed ? next : { ...next, sprinting: false };
}

/** После принятого движения — обновить серверный запас сил. `endless` — у ищущего силы не кончаются. */
export function recordSprint(stamina: StaminaState, accepted: PlayerState, elapsedMs: number, endless = false): void {
  const dt = Math.min(Math.max(elapsedMs, 0) / 1000, MAX_STEP_S);
  tickStamina(stamina, accepted.sprinting, accepted.sprinting ? dt * SERVER_DRAIN : dt, endless);
}
