import * as THREE from 'three';
import { clamp } from '@mecha/shared';
import type { WorldGeometry } from '../world/active-map';

const PIVOT_HEIGHT = 0.85; // середина корпуса
const DEFAULT_DISTANCE = 2.2;
const MIN_DISTANCE = 0.9;
const MAX_DISTANCE = 4;
const WALL_PADDING = 0.15;

/**
 * Камера Мастерской: облёт вокруг своего персонажа.
 * В отличие от камеры игры, смотрит на центр корпуса, приближается щипком и стартует спереди —
 * красят обычно лицо и грудь.
 */
export class StudioCamera {
  yaw = 0;
  pitch = 0.15;
  distance = DEFAULT_DISTANCE;
  private readonly pivot = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: WorldGeometry,
  ) {}

  /** Встать перед персонажем, который смотрит в направлении facing. */
  frameFront(facing: number): void {
    this.yaw = facing;
    this.pitch = 0.15;
    this.distance = DEFAULT_DISTANCE;
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.6, 1.3);
  }

  zoom(factor: number): void {
    this.distance = clamp(this.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  update(target: THREE.Vector3): void {
    this.pivot.set(target.x, target.y + PIVOT_HEIGHT, target.z);
    const cosPitch = Math.cos(this.pitch);
    this.direction.set(Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), Math.cos(this.yaw) * cosPitch);

    // Прячешься в углу — камера не должна уйти в стену. Придвигаем её, как в обычной камере.
    let distance = this.distance;
    this.raycaster.set(this.pivot, this.direction);
    this.raycaster.far = distance + WALL_PADDING;
    const hit = this.raycaster.intersectObjects(this.world.obstacles as THREE.Object3D[], false)[0];
    if (hit) distance = Math.max(hit.distance - WALL_PADDING, 0.4);

    this.camera.position.copy(this.pivot).addScaledVector(this.direction, distance);
    this.camera.lookAt(this.pivot);
  }
}
