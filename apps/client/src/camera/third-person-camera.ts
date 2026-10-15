import * as THREE from 'three';
import { clamp } from '@mecha/shared';
import type { WorldGeometry } from '../world/active-map';

const PIVOT_HEIGHT = 1.35; // камера смотрит на уровень плеч, а не на ноги
const PIVOT_HEIGHT_CROUCHED = 0.75;
const DISTANCE = 4.5;
const MIN_DISTANCE = 0.6;
const WALL_PADDING = 0.25;
const PITCH_MIN = -0.35;
const PITCH_MAX = 1.3;

/**
 * Камера от третьего лица на «сфере» вокруг игрока.
 * yaw — поворот вокруг вертикали, pitch — наклон (выше/ниже).
 *
 * Если между игроком и камерой стена — придвигаем камеру ближе,
 * иначе игрок увидит стену вместо персонажа.
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.35;

  /** Отдача: камера на миг задирается вверх и возвращается. */
  private kickPitch = 0;
  /** Тряска (м): затухает сама. */
  private shakeAmount = 0;
  private distance = DISTANCE;
  private pivotHeight = PIVOT_HEIGHT;
  private readonly pivot = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: WorldGeometry,
  ) {}

  /** Толчок отдачи (рад). Складывается: очередь выстрелов задирает сильнее. */
  kick(amount: number): void {
    this.kickPitch = Math.min(0.12, this.kickPitch + amount);
  }

  /** Встряска экрана — при попадании: «есть!» чувствуется телом. */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** dx, dy — смещение пальца/мыши в радианах. */
  rotate(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, PITCH_MIN, PITCH_MAX);
  }

  /** Куда «вперёд» для джойстика: горизонтальное направление взгляда камеры. */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  update(target: THREE.Vector3, frameDt: number, crouching = false): void {
    // В приседе камера плавно опускается вместе с персонажем — видно, что под столом.
    const wantedHeight = crouching ? PIVOT_HEIGHT_CROUCHED : PIVOT_HEIGHT;
    this.pivotHeight += (wantedHeight - this.pivotHeight) * (1 - Math.exp(-10 * frameDt));
    this.pivot.set(target.x, target.y + this.pivotHeight, target.z);

    // Сферические координаты -> направление от игрока к камере. Отдача опускает камеру
    // (pitch меньше) — взгляд уходит вверх, как будто ствол подбросило.
    this.kickPitch *= Math.exp(-12 * frameDt);
    const pitch = this.pitch - this.kickPitch;
    const cosPitch = Math.cos(pitch);
    this.direction.set(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(pitch),
      Math.cos(this.yaw) * cosPitch,
    );

    let desired = DISTANCE;
    this.raycaster.set(this.pivot, this.direction);
    this.raycaster.far = DISTANCE + WALL_PADDING;
    const hit = this.raycaster.intersectObjects(this.world.obstacles as THREE.Object3D[], false)[0];
    if (hit) desired = Math.max(hit.distance - WALL_PADDING, MIN_DISTANCE);

    if (desired < this.distance) {
      this.distance = desired; // к стене — сразу, иначе камера на кадр окажется внутри
    } else {
      // от стены — плавно. 1 - exp(-k·dt) даёт одинаковую плавность при любом FPS.
      this.distance += (desired - this.distance) * (1 - Math.exp(-8 * frameDt));
    }

    this.camera.position.copy(this.pivot).addScaledVector(this.direction, this.distance);
    this.camera.lookAt(this.pivot);
    if (this.shakeAmount > 0.001) {
      // Случайный сдвиг каждый кадр, быстро затухает. Сдвигаем после lookAt — взгляд «дрожит».
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount *= Math.exp(-14 * frameDt);
    }
  }
}
