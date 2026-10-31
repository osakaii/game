/**
 * Подсказки ищущим: во второй половине поиска прячущиеся сами «свистят» со своего места —
 * объёмный звук (слышно направление и расстояние), без значков над головой. Как в Meccha Chameleon:
 * раунд не застревает на одном идеально спрятавшемся, а прячущийся знает, что свист выдаёт
 * его, и может успеть перебежать.
 *
 * По таймеру и всем сразу: никто не решает, кому свистеть, и на большой площади
 * в последнюю минуту свист чаще — к концу раунда искать легче.
 */
export const HINT_RULES = {
  /** Свист раз в столько секунд во второй половине поиска. */
  every: 30,
  /** …а в последние finalWindow секунд — чаще. */
  finalEvery: 15,
  finalWindow: 60,
} as const;

/**
 * Когда свистеть: секунды от начала поиска. Начинаем с середины, шаг 30 с, в последнюю минуту — 15 с.
 * Например, 240 с → 120, 150, 180, 195, 210, 225.
 */
export function hintSchedule(seekSeconds: number): number[] {
  const times: number[] = [];
  for (let t = Math.ceil(seekSeconds / 2); t < seekSeconds; ) {
    times.push(t);
    t += seekSeconds - t <= HINT_RULES.finalWindow ? HINT_RULES.finalEvery : HINT_RULES.every;
  }
  return times;
}

/** Сервер → комната: кто и откуда свистнул (только ненайденные прячущиеся, позиции — серверные). */
export interface HintPing {
  players: { id: string; x: number; y: number; z: number }[];
}
