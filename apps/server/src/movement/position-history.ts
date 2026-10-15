import type { Pose } from '@mecha/shared';

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  crouching: boolean;
  pose: Pose;
}

/** 1 секунда при 20 пакетах в секунду — с запасом больше максимальной перемотки. */
const CAPACITY = 24;

export interface HistoricPosition {
  x: number;
  y: number;
  z: number;
  yaw: number;
  crouching: boolean;
  pose: Pose;
}

/**
 * История принятых позиций игрока — для компенсации задержки (lag compensation).
 *
 * Ищущий видит прячущегося «в прошлом» (интерполяция ~100 мс плюс пинг).
 * Чтобы честно проверить его тап, сервер спрашивает: где был прячущийся
 * в тот момент, который ищущий видел на экране?
 */
export class PositionHistory {
  private readonly samples: Sample[] = [];

  push(t: number, state: { x: number; y: number; z: number; yaw?: number; crouching: boolean; pose?: Pose }): void {
    const last = this.samples.at(-1);
    if (last && t < last.t) return;
    this.samples.push({
      t,
      x: state.x,
      y: state.y,
      z: state.z,
      yaw: state.yaw ?? 0,
      crouching: state.crouching,
      pose: state.pose ?? 'none',
    });
    if (this.samples.length > CAPACITY) this.samples.shift();
  }

  /** Позиция в момент t: интерполяция между соседними записями; вне истории — крайняя запись. */
  at(t: number): HistoricPosition | null {
    const s = this.samples;
    if (s.length === 0) return null;
    // Сначала проверяем свежий край: при одинаковых метках времени новая запись важнее старой.
    const last = s[s.length - 1];
    if (t >= last.t) return last;
    if (t <= s[0].t) return s[0];

    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1];
      const b = s[i];
      if (a.t <= t && t <= b.t) {
        const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * k,
          y: a.y + (b.y - a.y) * k,
          z: a.z + (b.z - a.z) * k,
          // Угол — по кратчайшей дуге: из 179° в −179° через 180°, а не через 0°.
          yaw: a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k,
          // Присед и поза — не числа, интерполировать нечего: берём ближайшую запись.
          crouching: k < 0.5 ? a.crouching : b.crouching,
          pose: k < 0.5 ? a.pose : b.pose,
        };
      }
    }
    return last;
  }

  clear(): void {
    this.samples.length = 0;
  }
}
