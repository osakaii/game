import * as THREE from 'three';
import { PLAYER, groundHeightAt, type NetPlayer, type Pose } from '@mecha/shared';
import type { WorldGeometry } from '../world/active-map';
import { createNameLabel, disposeNameLabel } from './name-label';
import { PlayerModel } from './player-model';

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  grounded: boolean;
  crouching: boolean;
  pose: Pose;
  climbing: boolean;
}

const MAX_SAMPLES = 20;

/**
 * Чужой игрок. Мы не знаем, где он СЕЙЧАС, — знаем только, где он был в моменты снимков.
 * Поэтому рисуем его в прошлом (renderTime = serverNow - задержка) и интерполируем
 * между двумя снимками вокруг renderTime. Движение получается плавным даже при 20 Гц и джиттере.
 */
export class RemotePlayer {
  readonly model = new PlayerModel();
  private readonly samples: Sample[] = [];
  private label: THREE.Sprite | null = null;
  /** Какая ревизия кожи сейчас нарисована на модели (-1 — ещё никакая, стоит основа по умолчанию). */
  skinRevision = -1;
  private nickname = '';

  constructor(
    readonly id: string,
    private readonly world: WorldGeometry,
  ) {}

  setNickname(nickname: string): void {
    if (nickname === this.nickname) return;
    this.nickname = nickname;
    if (this.label) {
      this.model.root.remove(this.label);
      disposeNameLabel(this.label);
    }
    this.label = createNameLabel(nickname);
    this.label.position.y = PLAYER.height + 0.3;
    this.model.root.add(this.label);
  }

  /** В прятках ники соперников скрыты: табличка над головой выдала бы спрятавшегося. */
  setLabelVisible(visible: boolean): void {
    if (this.label) this.label.visible = visible;
  }

  addSample(t: number, state: NetPlayer): void {
    const last = this.samples.at(-1);
    if (last && t <= last.t) return; // дубль или опоздавший пакет
    this.samples.push({
      t,
      x: state.x,
      y: state.y,
      z: state.z,
      yaw: state.yaw,
      grounded: state.grounded,
      crouching: state.crouching,
      pose: state.pose,
      climbing: state.climbing,
    });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  render(renderTime: number, frameDt: number): void {
    const samples = this.samples;
    if (samples.length === 0) return;

    // Ищем пару снимков a, b: a.t <= renderTime <= b.t.
    // Если renderTime новее последнего снимка (пакеты задержались) — a = b = последний,
    // игрок замирает на последней известной позиции. Угадывать дальше (экстраполяция) не будем:
    // в прятках ложное движение хуже паузы.
    let a = samples[0];
    let b = samples[0];
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i].t <= renderTime) {
        a = samples[i];
        b = samples[i + 1] ?? samples[i];
        break;
      }
    }

    const span = b.t - a.t;
    const alpha = span > 0 ? Math.min(Math.max((renderTime - a.t) / span, 0), 1) : 0;

    const root = this.model.root;
    root.position.set(lerp(a.x, b.x, alpha), lerp(a.y, b.y, alpha), lerp(a.z, b.z, alpha));
    root.rotation.y = lerpAngle(a.yaw, b.yaw, alpha);

    const speed = span > 0 ? Math.hypot(b.x - a.x, b.z - a.z) / (span / 1000) : 0;
    this.model.setCrouch(b.crouching, frameDt);
    this.model.setPose(b.pose);
    // Скорость лазания — по высоте между снимками: лезет вверх — перебирает руками, висит — замер.
    this.model.setClimbing(b.climbing, span > 0 ? Math.abs(b.y - a.y) / (span / 1000) : 0);
    this.model.animate(frameDt, Math.min(speed / PLAYER.walkSpeed, PLAYER.sprintSpeed / PLAYER.walkSpeed), b.grounded);
    const p = root.position;
    this.model.setShadowGround(groundHeightAt(p.x, p.z, p.y, this.world.colliders));
  }

  dispose(): void {
    if (this.label) disposeNameLabel(this.label);
    this.model.root.removeFromParent();
    this.model.dispose(); // у каждого игрока своя текстура кожи — освобождаем видеопамять
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Интерполяция угла по кратчайшей дуге (из 179° в -179° — через 180°, а не через 0°). */
function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
