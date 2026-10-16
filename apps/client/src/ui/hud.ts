import type { ConnectionState } from '../net/network';
import { $, storage } from './dom';

/** Пинг выше этого игрок замечает (рывки чужих, задержка выстрела) — тогда и показываем. */
export const SLOW_PING_MS = 250;
/**
 * localStorage['mecha:debug']: '1' — подробный HUD и в собранной игре (снять показания на телефоне),
 * '0' — HUD игрока даже в dev (посмотреть, что видит игрок). Нет ключа — подробно только в dev.
 */
const DEBUG_KEY = 'mecha:debug';

function debugByDefault(): boolean {
  const stored = storage.get(DEBUG_KEY);
  return stored === null ? import.meta.env.DEV : stored === '1';
}

/**
 * Угол с техническими данными: статус соединения, пинг, FPS, версия.
 *
 * Игроку на телефоне они только мешают — места мало. Поэтому без режима отладки HUD молчит, пока всё
 * хорошо, и появляется сам, когда есть что сказать: связь пропала или пинг высокий.
 */
export class Hud {
  private readonly root = $('#hud');
  private readonly statusEl = $('#status');
  private readonly pingEl = $('#ping');
  private readonly fpsEl = $('#fps');
  private frames = 0;
  private elapsed = 0;

  constructor(debug = debugByDefault()) {
    this.root.classList.toggle('debug', debug);
  }

  setStatus(state: ConnectionState, text: string): void {
    this.statusEl.dataset.state = state;
    this.statusEl.textContent = text;
  }

  setPing(rttMs: number): void {
    this.pingEl.textContent = `пинг ${Math.round(rttMs)} мс`;
    this.pingEl.classList.toggle('slow', rttMs >= SLOW_PING_MS);
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
