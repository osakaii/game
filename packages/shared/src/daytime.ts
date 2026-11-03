/**
 * Время суток раунда. Выбирает сервер — случайно на каждый раунд, — чтобы свет у всех игроков был
 * один и тот же: маскировка, подобранная на закате, у ищущего тоже выглядит закатной.
 *
 * Ночи нет: самое тёмное — сумерки. Цвета для маскировки в них ещё различимы, а экран телефона
 * на улице не превращается в чёрное зеркало.
 */
export const DAYTIMES = ['morning', 'day', 'sunset', 'dusk'] as const;
export type Daytime = (typeof DAYTIMES)[number];

/** Главный экран и новая комната — днём: первое впечатление — ярко и понятно. */
export const DEFAULT_DAYTIME: Daytime = 'day';

/** Время суток следующего раунда: случайное, но не то же, что было, — смена заметна каждый раунд. */
export function pickDaytime(previous: Daytime | null, random: () => number = Math.random): Daytime {
  const options = DAYTIMES.filter((daytime) => daytime !== previous);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}
