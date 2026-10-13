import type { ConnectionState } from '../net/network';
import { $ } from './dom';

/** Верхняя панель: статус соединения, пинг, FPS. */
export class Hud {
  private readonly statusEl = $('#status');
  private readonly pingEl = $('#ping');
  private readonly fpsEl = $('#fps');
  private frames = 0;
  private elapsed = 0;

  setStatus(state: ConnectionState, text: string): void {
    this.statusEl.dataset.state = state;
    this.statusEl.textContent = text;
  }

  setPing(rttMs: number): void {
    this.pingEl.textContent = `ping ${Math.round(rttMs)} ms`;
  }

  /** Считаем кадры и раз в полсекунды обновляем текст — DOM не трогаем каждый кадр. */
  tick(frameDt: number): void {
    this.frames++;
    this.elapsed += frameDt;
    if (this.elapsed >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.elapsed)} fps`;
      this.frames = 0;
      this.elapsed = 0;
    }
  }
}
