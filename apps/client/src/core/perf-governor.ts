/**
 * Автокачество: если игра тормозит, ступенчато упрощаем графику.
 *
 *   2 — всё включено;   1 — без теней (самое дорогое);
 *   0 — без теней + лёгкая симуляция краски + рендер в 1× вместо 2×.
 *
 * Качество только понижается: если повышать обратно, игра «качалась» бы между уровнями
 * (стало легче → включили тени → снова тормозит → выключили…).
 */
export type QualityLevel = 0 | 1 | 2;

export interface GovernorOptions {
  /** Медленнее этого (мс на кадр) — тормозит. 22 мс ≈ 45 FPS. */
  slowFrameMs: number;
  /** Сколько секунд подряд должно тормозить, чтобы понизить качество. */
  sustainSec: number;
  /** Первые секунды после старта не считаем: грузятся текстуры, компилируются шейдеры. */
  warmupSec: number;
}

const DEFAULTS: GovernorOptions = { slowFrameMs: 22, sustainSec: 3, warmupSec: 4 };
/** Кадр длиннее — это не тормоза, а возврат во вкладку или пауза отладчика. */
const IGNORE_FRAME_SEC = 0.25;

export class PerfGovernor {
  private elapsed = 0;
  private slowFor = 0;
  /** Сглаженная длительность кадра (EMA): один медленный кадр не должен ничего решать. */
  private averageMs = 16.7;
  private readonly options: GovernorOptions;

  constructor(
    public level: QualityLevel,
    private readonly apply: (level: QualityLevel) => void,
    options: Partial<GovernorOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  tick(frameDt: number): void {
    if (this.level === 0 || frameDt > IGNORE_FRAME_SEC) return;
    this.elapsed += frameDt;
    this.averageMs += (frameDt * 1000 - this.averageMs) * 0.05;
    if (this.elapsed < this.options.warmupSec) return;

    this.slowFor = this.averageMs > this.options.slowFrameMs ? this.slowFor + frameDt : 0;
    if (this.slowFor >= this.options.sustainSec) {
      this.level = (this.level - 1) as QualityLevel;
      this.slowFor = 0;
      this.averageMs = 16.7; // после понижения меряем заново
      this.apply(this.level);
    }
  }
}
