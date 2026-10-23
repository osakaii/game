import {
  TELEMETRY_INTERVAL_SEC,
  TELEMETRY_MAX_ERRORS,
  TELEMETRY_MIN_SEC,
  clip,
  type ClientReport,
  type DeviceInfo,
  type PerfReport,
} from '@mecha/shared';

/** Кадр длиннее — не тормоза, а свёрнутая вкладка или пауза отладчика: в замер не берём. */
const IGNORE_FRAME_SEC = 0.25;

/**
 * Статистика кадров за период: средний FPS и «просадки».
 *
 * Средний FPS врёт о плавности: 55 кадров по 16 мс и 5 по 100 мс — это «50 FPS», но игрок видит
 * рывки. Поэтому второе число — FPS по 5% самых медленных кадров (95-й процентиль длительности).
 */
export class FrameStats {
  private frameMs: number[] = [];
  private elapsed = 0;

  add(frameDt: number): void {
    if (frameDt <= 0 || frameDt > IGNORE_FRAME_SEC) return;
    this.frameMs.push(frameDt * 1000);
    this.elapsed += frameDt;
  }

  get seconds(): number {
    return this.elapsed;
  }

  summary(): { fps: number; lowFps: number; seconds: number } {
    if (this.frameMs.length === 0) return { fps: 0, lowFps: 0, seconds: 0 };
    const sorted = [...this.frameMs].sort((a, b) => a - b);
    const slow = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return {
      fps: round(this.frameMs.length / this.elapsed),
      lowFps: round(1000 / slow),
      seconds: round(this.elapsed),
    };
  }

  reset(): void {
    this.frameMs = [];
    this.elapsed = 0;
  }
}

/** Что игра знает о себе в момент отчёта. null — не в комнате: замер лобби-меню неинтересен. */
export type PerfSnapshot = Omit<PerfReport, 'kind' | 'fps' | 'lowFps' | 'seconds' | 'device'>;

/**
 * Телеметрия: раз в TELEMETRY_INTERVAL_SEC шлёт серверу замер FPS и ошибки JS.
 * Сама ничего не знает про сеть и сцену — получает функции отправки и снимка (так её легко проверить тестом).
 */
export class Telemetry {
  private readonly frames = new FrameStats();
  private sinceReport = 0;
  private errorsSent = 0;
  private readonly seenErrors = new Set<string>();

  constructor(
    private readonly send: (report: ClientReport) => void,
    private readonly device: DeviceInfo,
    private readonly snapshot: () => PerfSnapshot | null,
    private readonly version: string,
  ) {}

  /** Каждый кадр, сразу после отрисовки сцены (тогда счётчики рендера — про этот кадр). */
  tick(frameDt: number): void {
    this.frames.add(frameDt);
    this.sinceReport += frameDt;
    if (this.sinceReport < TELEMETRY_INTERVAL_SEC) return;
    this.sinceReport = 0;
    const state = this.snapshot();
    if (state && this.frames.seconds >= TELEMETRY_MIN_SEC) {
      this.send({ kind: 'perf', ...this.frames.summary(), ...state, device: this.device });
    }
    this.frames.reset();
  }

  /** Одинаковую ошибку шлём один раз, всего — не больше TELEMETRY_MAX_ERRORS за сессию. */
  reportError(message: string, source: string, stack: string): void {
    // «Script error.» — браузер скрыл подробности чужого скрипта (расширение): толку от неё нет.
    if (!message || message === 'Script error.') return;
    const key = `${message}|${source}`;
    if (this.seenErrors.has(key) || this.errorsSent >= TELEMETRY_MAX_ERRORS) return;
    this.seenErrors.add(key);
    this.errorsSent++;
    this.send({ kind: 'error', message: clip(message, 500), source: clip(source, 300), stack: clip(stack, 2000), version: clip(this.version, 32) });
  }
}

/** Ловить необработанные ошибки и отклонённые промисы со всей страницы. */
export function captureErrors(telemetry: Telemetry, target: Window = window): void {
  target.addEventListener('error', (e) => {
    telemetry.reportError(e.message, `${e.filename}:${e.lineno}:${e.colno}`, e.error instanceof Error ? (e.error.stack ?? '') : '');
  });
  target.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    telemetry.reportError(`Промис: ${message}`, '', reason instanceof Error ? (reason.stack ?? '') : '');
  });
}

/** Что известно об устройстве: модель (User-Agent), видеокарта, экран, ядра, память. */
export function deviceInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): DeviceInfo {
  // Настоящее имя видеокарты отдаёт только это расширение; без него браузер говорит общее «WebKit WebGL».
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    ua: clip(navigator.userAgent, 300),
    gpu: clip(gpu, 200),
    dpr: Math.min(6, Math.max(0.5, window.devicePixelRatio || 1)),
    screenW: Math.round(window.screen.width),
    screenH: Math.round(window.screen.height),
    cores: navigator.hardwareConcurrency || null,
    memoryGb: typeof memory === 'number' ? memory : null,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
