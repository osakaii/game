import * as THREE from 'three';
import { clamp } from '@mecha/shared';
import type { WorldGeometry } from '../world/active-map';

const PIVOT_HEIGHT = 0.85; // середина корпуса
const DEFAULT_DISTANCE = 2.2;
const MIN_DISTANCE = 0.9;
const MAX_DISTANCE = 4;
const WALL_PADDING = 0.15;
/** Типичное расстояние, с которого ищущий осматривает комнату. */
const PREVIEW_DISTANCE = 6.5;
const UP = new THREE.Vector3(0, 1, 0);
const START_PITCH = 0.15;
/** Сколько направлений вокруг персонажа пробовать при открытии (через 22.5°). */
const OPEN_SAMPLES = 16;

/**
 * Камера Мастерской: облёт вокруг своего персонажа.
 * В отличие от камеры игры, смотрит на центр корпуса, приближается щипком и стартует спереди —
 * красят обычно лицо и грудь.
 */
export class StudioCamera {
  yaw = 0;
  pitch = 0.15;
  distance = DEFAULT_DISTANCE;
  /** «Глазами ищущего»: камера далеко, как у ищущего, — видно, сливаешься ли с фоном. */
  preview = false;
  /**
   * Где на экране держать персонажа: сдвиг от центра в долях ширины экрана (+ — вправо).
   * Панели Мастерской слева и справа разной ширины: в центре экрана персонаж оказался бы под панелью,
   * поэтому ставим его в центр свободного места между ними.
   */
  screenShift = 0;
  private readonly pivot = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: WorldGeometry,
  ) {}

  /** Встать перед персонажем, который смотрит в направлении facing. */
  frameFront(facing: number): void {
    this.yaw = facing;
    this.pitch = START_PITCH;
    this.distance = DEFAULT_DISTANCE;
  }

  /**
   * Встать там, где есть место. Красят обычно лицо, поэтому сначала — спереди; но прячущийся часто
   * стоит лицом к стене, и спереди камера упёрлась бы в неё вплотную. Тогда пробуем направления
   * всё дальше от переда (±22.5°, ±45°…) и берём первое свободное; свободных нет (угол, шкаф) —
   * самое просторное.
   */
  frameOpen(facing: number, target: THREE.Vector3): void {
    this.frameFront(facing);
    this.setPivot(target);
    const step = (Math.PI * 2) / OPEN_SAMPLES;
    let bestYaw = facing;
    let bestFree = -Infinity;
    for (let k = 0; k < OPEN_SAMPLES; k++) {
      // 0, +1, −1, +2, −2… шагов: по порядку удаления от переда.
      const offset = Math.ceil(k / 2) * step * (k % 2 === 1 ? 1 : -1);
      const yaw = facing + offset;
      const free = this.freeDistance(yaw, START_PITCH, DEFAULT_DISTANCE);
      if (free >= DEFAULT_DISTANCE) {
        bestYaw = yaw;
        break;
      }
      if (free > bestFree) {
        bestFree = free;
        bestYaw = yaw;
      }
    }
    this.yaw = bestYaw;
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.6, 1.3);
  }

  zoom(factor: number): void {
    this.distance = clamp(this.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  update(target: THREE.Vector3): void {
    this.setPivot(target);
    // Прячешься в углу — камера не должна уйти в стену. Придвигаем её, как в обычной камере.
    const distance = Math.max(this.freeDistance(this.yaw, this.pitch, this.preview ? PREVIEW_DISTANCE : this.distance), 0.4);

    // Сдвиг на экране = параллельный перенос камеры вбок (панорама), а не поворот: перспектива та же,
    // персонаж просто оказывается левее или правее. Ширина кадра на расстоянии distance — 2·d·tan(fov/2)·aspect.
    const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const pan = -this.screenShift * 2 * halfHeight * this.camera.aspect;
    // «Вправо» для камеры: взгляд (к персонажу, −direction) × вверх.
    this.right.set(-this.direction.x, 0, -this.direction.z).cross(UP).normalize();
    this.lookAt.copy(this.pivot).addScaledVector(this.right, pan);
    this.camera.position.copy(this.pivot).addScaledVector(this.direction, distance).addScaledVector(this.right, pan);
    this.camera.lookAt(this.lookAt);
  }

  private setPivot(target: THREE.Vector3) {
    this.pivot.set(target.x, target.y + PIVOT_HEIGHT, target.z);
  }

  /**
   * Сколько места от центра корпуса до стены в направлении (yaw, pitch), не больше wanted.
   * Заодно оставляет в this.direction это направление — по нему потом ставится камера.
   */
  private freeDistance(yaw: number, pitch: number, wanted: number): number {
    const cosPitch = Math.cos(pitch);
    this.direction.set(Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch);
    this.raycaster.set(this.pivot, this.direction);
    this.raycaster.far = wanted + WALL_PADDING;
    const hit = this.raycaster.intersectObjects(this.world.obstacles as THREE.Object3D[], false)[0];
    return hit ? hit.distance - WALL_PADDING : wanted;
  }
}
