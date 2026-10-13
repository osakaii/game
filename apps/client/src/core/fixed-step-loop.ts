/**
 * Игровой цикл с фиксированным шагом физики.
 *
 * Экран обновляется с разной частотой (60/90/120 Гц, просадки FPS),
 * а физика всегда шагает ровно по `stepDt`. Остаток времени копится в accumulator.
 * alpha = насколько мы «между» двумя шагами физики — по нему интерполируем картинку.
 */
export interface LoopCallbacks {
  fixedUpdate(dt: number): void;
  render(alpha: number, frameDt: number): void;
}

/** Если вкладка была в фоне — не пытаемся догнать минуты симуляции за один кадр. */
const MAX_FRAME_DT = 0.25;

export function startFixedStepLoop(stepDt: number, callbacks: LoopCallbacks): void {
  let accumulator = 0;
  let last = performance.now();

  function frame(now: number) {
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;

    accumulator += frameDt;
    while (accumulator >= stepDt) {
      callbacks.fixedUpdate(stepDt);
      accumulator -= stepDt;
    }

    callbacks.render(accumulator / stepDt, frameDt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
