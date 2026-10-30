import type * as THREE from 'three';
import type { MapDef, Pose, PoseId, Vec3 } from '@mecha/shared';
import type { StudioCamera } from '../paint/studio-camera';

/** Камера ходит туда-обратно перед персонажем, а не по кругу: сзади смотреть не на что. */
const SWING = 0.5; // рад в каждую сторону
const SWING_PERIOD = 26; // с
const DISTANCE = 2.6;
const PITCH = 0.06;
/** Персонаж левее центра (доля ширины экрана): справа внизу — «Играть» и «По коду». */
const SCREEN_SHIFT = -0.14;
/** Цикл: постоял, показал позу пряток, снова постоял. */
const IDLE_SECONDS = 4;
const POSE_SECONDS = 3;
/** Позы, которые красиво смотрятся стоя на площади. Лёжа и ползком персонажа почти не видно. */
const SHOW_POSES: readonly PoseId[] = ['handsUp', 'statue', 'ball', 'sit'];

/** Какая поза сейчас (секунды с открытия главного экрана). */
export function showcasePose(time: number): Pose {
  const cycle = IDLE_SECONDS + POSE_SECONDS;
  const k = Math.floor(time / cycle);
  return time - k * cycle < IDLE_SECONDS ? 'none' : SHOW_POSES[k % SHOW_POSES.length]!;
}

/** Где стоит персонаж на главном экране. У карты без своей точки — первый спавн. */
export function showcaseSpot(map: MapDef): { position: Vec3; facing: number } {
  return map.showcase ?? { position: map.spawns[0]!, facing: 0 };
}

/**
 * Главный экран как в Fall Guys и Stumble Guys: свой персонаж на карте, а не тёмное окно.
 * Он дышит и время от времени показывает позы пряток, камера медленно ходит перед ним.
 * Камера — та же, что в Мастерской (облёт с переносом персонажа вбок), но управляет ей время, а не пальцы.
 */
export class MenuShowcase {
  active = false;
  /** Время облёта камеры. */
  private time = 0;
  /** Время цикла поз — отдельно: прыжок по тапу начинает цикл заново, а камера не должна дёрнуться. */
  private poseTime = 0;
  private facing = 0;
  private pose: Pose = 'none';
  private jumpQueued = false;

  constructor(
    private readonly view: StudioCamera,
    private readonly setPose: (pose: Pose) => void,
  ) {}

  start(facing: number): void {
    this.active = true;
    this.time = 0;
    this.poseTime = 0;
    this.facing = facing;
    this.view.pitch = PITCH;
    this.view.distance = DISTANCE;
    this.view.screenShift = SCREEN_SHIFT;
    // Сбрасываем и выбор игрока: из комнаты могли выйти лёжа.
    this.pose = 'none';
    this.setPose('none');
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.jumpQueued = false;
    this.pose = 'none';
    this.setPose('none');
  }

  /**
   * Тап по экрану главного экрана: персонаж подпрыгивает. Мелочь, но экран «живой» —
   * в Fall Guys по персонажу в меню тоже хочется тыкать.
   */
  poke(): void {
    if (!this.active) return;
    this.jumpQueued = true;
    // Из позы сразу в прыжок; цикл поз пойдёт заново — постоит и снова покажет позу.
    this.poseTime = 0;
    this.applyPose('none');
  }

  /** Прыжок для физики (как Controls.consumeJump): один раз на тап. */
  consumeJump(): boolean {
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return jump;
  }

  update(dt: number, target: THREE.Vector3): void {
    this.time += dt;
    this.poseTime += dt;
    this.applyPose(showcasePose(this.poseTime));
    this.view.yaw = this.facing + Math.sin((this.time / SWING_PERIOD) * Math.PI * 2) * SWING;
    this.view.update(target);
  }

  private applyPose(pose: Pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.setPose(pose);
  }
}
