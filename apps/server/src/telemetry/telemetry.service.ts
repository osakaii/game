import { Injectable, Logger } from '@nestjs/common';
import type { ClientReport, ErrorReport, PerfReport } from '@mecha/shared';

/** Сколько последних замеров держим для сводки. Хватит на вечер игры, память — копейки. */
const PERF_LIMIT = 500;
/** Сколько разных ошибок помним (одинаковые складываются в счётчик). */
const ERROR_LIMIT = 50;

interface PerfEntry extends PerfReport {
  playerId: string;
  at: number;
}

interface ErrorEntry {
  message: string;
  source: string;
  version: string;
  /** Начало стека — чтобы понять, где упало, не храня килобайты. */
  stack: string;
  count: number;
  players: Set<string>;
  lastAt: number;
}

export interface GpuStats {
  gpu: string;
  reports: number;
  fps: number;
  lowFps: number;
}

export interface TelemetryStats {
  since: string;
  perf: {
    reports: number;
    players: number;
    /** Медиана и 10-й процентиль среднего FPS: «обычный» игрок и «слабый» (каждый десятый хуже). */
    fps: { median: number; p10: number };
    lowFps: { median: number };
    /** Сколько отчётов на каждом уровне автокачества: много на 0 — графика слишком тяжёлая. */
    quality: Record<'0' | '1' | '2', number>;
    wet8bit: number;
    /** Видеокарты от частых к редким — где тормозит. */
    gpus: GpuStats[];
  };
  errors: { message: string; source: string; version: string; stack: string; count: number; players: number; lastAt: string }[];
}

/**
 * Телеметрия с устройств игроков: каждый отчёт — строка в логе (видно в панели Render),
 * последние — в памяти для сводки на /stats. Базы нет, как и у комнат: перезапуск сервера всё сбрасывает,
 * а для «как игра идёт на телефонах прямо сейчас» этого достаточно.
 *
 * id игрока хранится только чтобы считать уникальных игроков; наружу (в /stats) не отдаётся.
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger('Telemetry');
  private readonly startedAt = Date.now();
  private readonly perf: PerfEntry[] = [];
  private readonly errors = new Map<string, ErrorEntry>();

  record(playerId: string, report: ClientReport, now = Date.now()): void {
    if (report.kind === 'perf') this.recordPerf(playerId, report, now);
    else this.recordError(playerId, report, now);
  }

  stats(): TelemetryStats {
    const fps = this.perf.map((p) => p.fps);
    const quality = { '0': 0, '1': 0, '2': 0 };
    for (const p of this.perf) quality[String(p.quality) as '0' | '1' | '2']++;

    const byGpu = new Map<string, PerfEntry[]>();
    for (const p of this.perf) {
      const gpu = p.device.gpu || 'неизвестно';
      byGpu.set(gpu, [...(byGpu.get(gpu) ?? []), p]);
    }
    const gpus = [...byGpu]
      .map(([gpu, list]) => ({
        gpu,
        reports: list.length,
        fps: round(percentile(list.map((p) => p.fps), 50)),
        lowFps: round(percentile(list.map((p) => p.lowFps), 50)),
      }))
      .sort((a, b) => b.reports - a.reports)
      .slice(0, 15);

    const errors = [...this.errors.values()]
      .sort((a, b) => b.count - a.count)
      .map((e) => ({
        message: e.message,
        source: e.source,
        version: e.version,
        stack: e.stack,
        count: e.count,
        players: e.players.size,
        lastAt: new Date(e.lastAt).toISOString(),
      }));

    return {
      since: new Date(this.startedAt).toISOString(),
      perf: {
        reports: this.perf.length,
        players: new Set(this.perf.map((p) => p.playerId)).size,
        fps: { median: round(percentile(fps, 50)), p10: round(percentile(fps, 10)) },
        lowFps: { median: round(percentile(this.perf.map((p) => p.lowFps), 50)) },
        quality,
        wet8bit: this.perf.filter((p) => p.wet8bit).length,
        gpus,
      },
      errors,
    };
  }

  private recordPerf(playerId: string, report: PerfReport, now: number) {
    this.perf.push({ ...report, playerId, at: now });
    if (this.perf.length > PERF_LIMIT) this.perf.shift();
    // Одна строка JSON на отчёт: в логах Render её легко найти поиском «client-perf» и разобрать.
    const { device, ...rest } = report;
    this.logger.log(`client-perf ${JSON.stringify({ ...rest, gpu: device.gpu, ua: device.ua, dpr: device.dpr })}`);
  }

  private recordError(playerId: string, report: ErrorReport, now: number) {
    const key = `${report.message}|${report.source}`;
    let entry = this.errors.get(key);
    if (!entry) {
      // Забыть самую старую ошибку, если разных слишком много.
      if (this.errors.size >= ERROR_LIMIT) {
        const oldest = [...this.errors].sort((a, b) => a[1].lastAt - b[1].lastAt)[0];
        if (oldest) this.errors.delete(oldest[0]);
      }
      entry = { message: report.message, source: report.source, version: report.version, stack: report.stack.slice(0, 600), count: 0, players: new Set(), lastAt: now };
      this.errors.set(key, entry);
    }
    entry.count++;
    entry.players.add(playerId);
    entry.lastAt = now;
    entry.version = report.version;
    this.logger.warn(`client-error ${JSON.stringify({ message: report.message, source: report.source, version: report.version })}`);
  }
}

/** p-й процентиль (0–100) с линейной интерполяцией; пустой список — 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = ((sorted.length - 1) * p) / 100;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
