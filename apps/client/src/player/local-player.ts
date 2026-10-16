import * as THREE from 'three';
import {
  PLAYER,
  copyVec3,
  groundHeightAt,
  keepBodyOutOfWalls,
  stepPlayer,
  vec3,
  type MoveInput,
  type PlayerPhysicsState,
  type Vec3,
} from '@mecha/shared';
import type { WorldGeometry } from '../world/active-map';
import { PlayerModel } from './player-model';

const TURN_SPEED = 12; // рад/с — как быстро модель разворачивается по направлению движения

/** Игрок, которым управляем на этом устройстве: физика (shared) + модель (three). */
export class LocalPlayer {
  readonly model = new PlayerModel();
  readonly state: PlayerPhysicsState;
  /** Позиция для отрисовки: интерполяция между двумя последними шагами физики. */
  readonly renderPosition = new THREE.Vector3();

  private readonly prevPosition: Vec3;
  /** Начальный разворот — спиной к камере (камера по умолчанию смотрит на -Z). */
  private facingAngle = Math.PI;
  private aimYaw = 0;
  private aimTime = 0;

  constructor(
    spawn: Vec3,
    private readonly world: WorldGeometry,
  ) {
    this.state = { position: { ...spawn }, velocity: vec3(), grounded: true, crouching: false, pose: 'none' };
    this.prevPosition = { ...spawn };
    this.renderPosition.set(spawn.x, spawn.y, spawn.z);
    this.model.root.rotation.y = this.facingAngle;
  }

  /** Куда смотрит модель (рад) — отправляем на сервер, чтобы другие видели разворот. */
  get facing(): number {
    return this.facingAngle;
  }

  /**
   * Развернуться к цели (выстрел): ненадолго взгляд важнее направления бега.
   * Угол уходит на сервер — остальные видят, куда повернулся ищущий.
   */
  faceTowards(yaw: number, seconds = 0.6): void {
    this.aimYaw = yaw;
    this.aimTime = seconds;
  }

  /** Сервер поставил нас в точку: спавн или откат. Без интерполяции — мгновенно. */
  teleport(position: Vec3): void {
    copyVec3(this.state.position, position);
    copyVec3(this.prevPosition, position);
    this.state.velocity.x = this.state.velocity.y = this.state.velocity.z = 0;
  }

  fixedUpdate(input: MoveInput, dt: number): void {
    copyVec3(this.prevPosition, this.state.position);
    stepPlayer(this.state, input, this.world.colliders, dt);
    keepBodyOutOfWalls(this.state, this.facingAngle, this.world.colliders);
  }

  render(alpha: number, frameDt: number): void {
    const prev = this.prevPosition;
    const curr = this.state.position;
    this.renderPosition.set(
      prev.x + (curr.x - prev.x) * alpha,
      prev.y + (curr.y - prev.y) * alpha,
      prev.z + (curr.z - prev.z) * alpha,
    );

    const root = this.model.root;
    root.position.copy(this.renderPosition);

    const { x: vx, z: vz } = this.state.velocity;
    const speed = Math.hypot(vx, vz);
    const wall = this.state.climbing ? this.state.wallNormal : undefined;
    if (wall) {
      // На стене смотрим в стену (нормаль — от стены к нам, поэтому минус).
      this.facingAngle = rotateTowards(this.facingAngle, Math.atan2(-wall.x, -wall.z), TURN_SPEED * frameDt);
      root.rotation.y = this.facingAngle;
    } else if (this.aimTime > 0) {
      // Разворот к цели быстрый, но не мгновенный — видно движение, а не телепорт.
      this.aimTime -= frameDt;
      this.facingAngle = rotateTowards(this.facingAngle, this.aimYaw, TURN_SPEED * 3 * frameDt);
      root.rotation.y = this.facingAngle;
    } else if (speed > 0.3) {
      // Модель смотрит по +Z, поворот на atan2(x, z) разворачивает её в сторону движения.
      const target = Math.atan2(vx, vz);
      this.facingAngle = rotateTowards(this.facingAngle, target, TURN_SPEED * frameDt);
      root.rotation.y = this.facingAngle;
    }

    this.model.setCrouch(this.state.crouching, frameDt);
    this.model.setPose(this.state.pose);
    // Скорость по стене: вверх-вниз и вбок, без лёгкого прижима к стене (он есть всегда и не движение).
    const n = this.state.wallNormal;
    const along = n ? Math.hypot(vx + n.x * 0.5, vz + n.z * 0.5) : 0;
    this.model.setClimbing(!!this.state.climbing, Math.hypot(this.state.velocity.y, along));
    this.model.animate(frameDt, Math.min(speed / PLAYER.walkSpeed, 1), this.state.grounded);
    const p = this.renderPosition;
    this.model.setShadowGround(groundHeightAt(p.x, p.z, p.y, this.world.colliders));
  }
}

/** Поворот по кратчайшей дуге: из 170° в -170° — это 20°, а не 340°. */
function rotateTowards(current: number, target: number, maxStep: number): number {
  let delta = target - current;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}
