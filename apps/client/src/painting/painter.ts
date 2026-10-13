import { BODY_ZONES, DEFAULT_BODY_COLOR, canPaint, type BodyZone } from '@mecha/shared';
import { Emitter } from '../core/emitter';
import type { Controls } from '../input/controls';
import type { Lobby } from '../lobby/lobby';
import type { Network } from '../net/network';
import type { PlayerModel } from '../player/player-model';
import { errorMessage } from '../ui/error-messages';
import { toast } from '../ui/toast';
import type { Eyedropper } from './eyedropper';

const RECENT_LIMIT = 5;

/**
 * Логика покраски без DOM: текущий цвет, недавние цвета, пипетка, отправка на сервер.
 * Панель (PaintPanel) только показывает состояние и вызывает методы.
 */
export class Painter extends Emitter<{ change: void }> {
  color = DEFAULT_BODY_COLOR;
  recent: string[] = [];
  picking = false;

  constructor(
    private readonly eyedropper: Eyedropper,
    private readonly controls: Controls,
    private readonly network: Network,
    private readonly lobby: Lobby,
    private readonly model: PlayerModel,
  ) {
    super();
  }

  get allowed(): boolean {
    const room = this.lobby.room;
    return !!room && canPaint(room.phase, this.lobby.myRole);
  }

  colorOf(zone: BodyZone): string {
    return this.model.colorOf(zone);
  }

  startPicking(): void {
    this.picking = true;
    this.emit('change', undefined);
    this.controls.captureNextTap((x, y) => {
      this.picking = false;
      const color = this.eyedropper.pick(x, y);
      if (color) this.setColor(color);
      else toast('Тут нечего взять — коснись предмета');
      this.emit('change', undefined);
    });
  }

  cancelPicking(): void {
    if (!this.picking) return;
    this.picking = false;
    this.controls.cancelTapCapture();
    this.emit('change', undefined);
  }

  setColor(color: string): void {
    this.color = color;
    this.recent = [color, ...this.recent.filter((c) => c !== color)].slice(0, RECENT_LIMIT);
    this.emit('change', undefined);
  }

  /**
   * Оптимистичное обновление: красим модель сразу, не дожидаясь сервера, — отклик мгновенный.
   * Если сервер отказал (не та фаза, слишком часто), откатываемся к цветам из последнего room:state.
   */
  async paint(zones: readonly BodyZone[]): Promise<void> {
    if (!this.allowed) return;
    const color = this.color;
    for (const zone of zones) this.model.setZoneColor(zone, color);
    this.emit('change', undefined);

    const result = await this.network.paint({ zones: [...zones], color });
    if (!result.ok) {
      const confirmed = this.lobby.me?.colors;
      if (confirmed) this.model.setColors(confirmed);
      this.emit('change', undefined);
      if (result.error !== 'RATE_LIMITED') toast(errorMessage(result.error));
    }
  }

  paintAll(): Promise<void> {
    return this.paint(BODY_ZONES);
  }
}
