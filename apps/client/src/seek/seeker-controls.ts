import * as THREE from 'three';
import { INTERPOLATION_DELAY_MS, canShoot } from '@mecha/shared';
import type { Lobby } from '../lobby/lobby';
import type { Network } from '../net/network';
import { $ } from '../ui/dom';
import { errorMessage } from '../ui/error-messages';
import { toast } from '../ui/toast';

/**
 * Ищущий касается подозрительного места -> луч из камеры через точку касания -> сервер.
 *
 * Клиент НЕ решает, попал ли он: отправляет только луч (origin + направление).
 * Сервер проверит пересечение по своим позициям и своей карте.
 */
export class SeekerControls {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hint = $('#seek-hint');
  private nextShotAt = 0;
  private pending = false;
  private hintText = '';

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly network: Network,
    private readonly lobby: Lobby,
  ) {}

  get active(): boolean {
    const room = this.lobby.room;
    return !!room && canShoot(room.phase, this.lobby.myRole);
  }

  async tap(clientX: number, clientY: number): Promise<void> {
    if (!this.active || this.pending) return;
    if (this.network.clock.now() < this.nextShotAt) return;

    showRipple(clientX, clientY);
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;

    this.pending = true;
    const result = await this.network.shoot({
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dir: { x: direction.x, y: direction.y, z: direction.z },
      // Чужих игроков мы рисуем с задержкой интерполяции — значит, видели их в этот момент.
      viewTime: this.network.clock.now() - INTERPOLATION_DELAY_MS,
    });
    this.pending = false;

    if (!result.ok) {
      if (result.error !== 'RATE_LIMITED') toast(errorMessage(result.error));
      return;
    }
    this.nextShotAt = result.data.nextShotAt;
    if (!result.data.point) toast('Слишком далеко');
    else if (!result.data.hitPlayerId) toast('Мимо');
  }

  /** Каждый кадр: подсказка и индикатор перезарядки. */
  update(serverNow: number): void {
    const visible = this.active;
    if (this.hint.hidden === visible) this.hint.hidden = !visible;
    if (!visible) return;

    const cooldown = this.nextShotAt - serverNow;
    const text = cooldown > 0 ? `Перезарядка ${(cooldown / 1000).toFixed(1)} с` : 'Касайся подозрительных мест';
    if (text !== this.hintText) {
      this.hintText = text;
      this.hint.textContent = text;
      this.hint.classList.toggle('cooldown', cooldown > 0);
    }
  }
}

/** Круг в точке касания — подтверждение, что тап распознан. */
function showRipple(x: number, y: number) {
  const ripple = document.createElement('div');
  ripple.className = 'tap-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  // Элемент удаляет сам себя, когда CSS-анимация закончилась.
  ripple.addEventListener('animationend', () => ripple.remove());
  document.body.append(ripple);
}
