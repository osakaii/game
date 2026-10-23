import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY_ZONES, PLAYER, POSE_RULES, skinBaseColor, stanceKey, type BodyZone, type Pose, type SkinBase, type StanceKey } from '@mecha/shared';
import { getSkinAtlas } from '../skin/atlas';
import { buildBodyGeometry } from '../skin/body-geometry';
import { CHARACTER_PARTS, HIP_Y, PART_ORDER, partIndex } from '../skin/character-parts';
import { CLIMB, CROUCH, JUMP, POSE_LIBRARY, STAND, STUDIO, type BodyPose } from './body-poses';
import { Blaster } from './blaster';
import { geometryFor, hitboxLines } from './hitbox-debug';
import { roundBoxPoint } from '../skin/rounded-box';
import { SkinTexture } from '../skin/skin-texture';

/** Индексы «каналов» таза — после углов суставов в общем массиве. */
const HIP_Y_CH = PART_ORDER.length * 3;
const HIP_Z_CH = HIP_Y_CH + 1;
const HIP_PITCH_CH = HIP_Y_CH + 2;
const CHANNELS = HIP_Y_CH + 3;

/**
 * Суставы движутся как пружины с затуханием: a = ω²·(цель − x) − 2ζω·v.
 * Ходьба — жёсткая пружина без отскока (шаг чёткий). Позы — мягче и чуть с перелётом (ζ < 1):
 * персонаж «плюхается» на пол и слегка пружинит — переход живой, а не по линейке.
 */
const SPRING_WALK = { omega: 22, zeta: 0.9 };
const SPRING_POSE = { omega: 10, zeta: 0.6 };
/** Шаг интегрирования пружин: при подвисании кадра шагаем несколько раз, иначе пружина «взрывается». */
const SPRING_STEP = 1 / 60;

/**
 * Визуальная модель персонажа. Логики и физики здесь нет — только меши и анимация.
 *
 * Тело — один SkinnedMesh («кожа на скелете»): каждая часть жёстко привязана к своей кости.
 * Кости повторяют суставы из CHARACTER_PARTS:
 *   pelvis (таз) ─┬─ torso ─┬─ head (+ глаза)
 *                 │         └─ upperArm ─ forearm ─ hand  (×2)
 *                 └─ thigh ─ shin ─ foot                  (×2)
 *
 * Анимация: каждый кадр собираем целевую позу (стоит/присел/прыжок/поза/Мастерская + шаг или ползание
 * + дыхание) и подтягиваем к ней суставы пружинами.
 */
export class PlayerModel {
  /** Отладка: показывать коробки попаданий у всех персонажей (dev, клавиша H). */
  static showHitboxes = false;
  readonly root = new THREE.Group();
  /** Всё тело одной сеткой: один вызов отрисовки на персонажа. */
  readonly mesh: THREE.SkinnedMesh;
  readonly bones = {} as Record<BodyZone, THREE.Bone>;
  /**
   * Кожа персонажа: одна текстура на все части тела, разложенные по атласу.
   * Один материал на персонажа — на видеокарту уходит меньше переключений состояния.
   */
  readonly skin = new SkinTexture(getSkinAtlas());
  private readonly material = new THREE.MeshLambertMaterial({ map: this.skin.texture });
  private readonly eyeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  private base: SkinBase = 'default';

  private readonly body = new THREE.Group();
  private readonly pelvis = new THREE.Bone();
  private readonly shadow: THREE.Mesh;
  /** Углы суставов [x, y, z] по PART_ORDER, затем высота, сдвиг и наклон таза: текущие, целевые и скорости. */
  private readonly current = new Float32Array(CHANNELS);
  private readonly target = new Float32Array(CHANNELS);
  private readonly velocity = new Float32Array(CHANNELS);
  private pose: Pose = 'none';
  private climbing = false;
  /** Скорость лазания 0..1 — насколько быстро перебирать руками. */
  private climbSpeed01 = 0;
  private hitboxView: THREE.LineSegments | null = null;
  private blaster: Blaster | null = null;
  /** Сколько ещё держать руку с краскомётом нацеленной (с) и под каким углом к горизонту. */
  private aimTime = 0;
  private aimPitch = 0;
  /** Перезарядка для бака краски: сколько прошло и сколько всего (с). */
  private reloadElapsed = 1;
  private reloadTotal = 1;
  private walkPhase = 0;
  private breathPhase = Math.random() * Math.PI * 2; // у всех своё дыхание — толпа не «дышит хором»
  private crouching = false;
  private ghost = false;
  private studioPose = false;

  constructor() {
    // Кости в позе покоя. Таз — общий корень; части без родителя висят на нём.
    this.pelvis.position.y = HIP_Y;
    for (const part of PART_ORDER) {
      const bone = new THREE.Bone();
      bone.name = part;
      const { joint } = CHARACTER_PARTS[part];
      bone.position.set(joint.x, joint.y, joint.z);
      this.bones[part] = bone;
    }
    for (const part of PART_ORDER) {
      const parent = CHARACTER_PARTS[part].parent;
      (parent ? this.bones[parent] : this.pelvis).add(this.bones[part]);
    }

    this.mesh = new THREE.SkinnedMesh(buildBodyGeometry(getSkinAtlas()), this.material);
    this.mesh.add(this.pelvis);
    // Привязка: обратные матрицы костей считаются из их положения прямо сейчас — в позе покоя.
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(PART_ORDER.map((part) => this.bones[part])));
    // Границы считаются по позе на момент расчёта и не обновляются сами. Берём с запасом на любую позу
    // (лёжа, руки вверх) — иначе луч кисти или камера «теряли» бы руку, вышедшую за старые границы.
    this.mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1.1, -0.2, -1.1), new THREE.Vector3(1.1, 2, 1.1));
    this.mesh.boundingSphere = this.mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    // Тени карты запечены, персонаж в них не попадает как «отбрасывающий» — под ним круглая тень.
    // Но тень карты на нём видна: под столом он темнеет вместе со всем вокруг.
    this.mesh.receiveShadow = true;
    this.mesh.name = 'body';

    this.bones.head.add(this.createEyes());
    this.body.add(this.mesh);

    // Круглая «тень» — дешёвая замена настоящим теням, помогает понять высоту прыжка.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.body, this.shadow);
    this.setBase('default');
    this.applyPose(STAND);
    this.current.set(this.target);
    this.writeBones();
  }

  /** Нарисовать основу кожи (белую или форму ищущего) — до первой картинки или после сброса. */
  setBase(base: SkinBase): void {
    this.base = base;
    for (const zone of BODY_ZONES) this.skin.fillPart(zone, skinBaseColor(base, zone));
  }

  /** Наложить картинку кожи, пришедшую по сети. Она покрывает весь атлас целиком. */
  applySkinImage(image: CanvasImageSource): void {
    this.skin.drawImage(image);
  }

  /**
   * Какую текстуру натягивать на модель. По умолчанию — canvas-кожа (skin.texture).
   * Свой персонаж в Мастерской рисуется кистью на видеокарте — тогда сюда отдают её текстуру.
   */
  setSkinMap(texture: THREE.Texture | null): void {
    this.material.map = texture ?? this.skin.texture;
  }

  /** Поза манекена для Мастерской: стоит ровно, руки и ноги разведены. */
  setStudioPose(enabled: boolean): void {
    this.studioPose = enabled;
  }

  /** Отладка атласа: шахматка со стрелками «вверх» вместо раскраски. */
  showDebugPattern(enabled: boolean): void {
    if (enabled) this.skin.drawDebugPattern();
    else this.setBase(this.base);
  }

  /** Освободить видеопамять: текстура кожи у каждого игрока своя. */
  dispose(): void {
    this.setArmed(false);
    this.skin.dispose();
    this.material.dispose();
    this.eyeMaterial.dispose();
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }

  /**
   * Призрак — найденный прячущийся: полупрозрачный, наблюдает за раундом.
   * Смена transparent требует needsUpdate: three.js пересоберёт шейдер материала.
   */
  setGhost(ghost: boolean): void {
    this.ghost = ghost;
    this.body.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.Material;
      if (material.transparent === ghost) return;
      material.transparent = ghost;
      material.opacity = ghost ? 0.3 : 1;
      material.depthWrite = !ghost;
      material.needsUpdate = true;
    });
  }

  /** Круглая тень лежит на опоре под персонажем (в прыжке остаётся внизу). У призрака тени нет. */
  setShadowGround(groundY: number): void {
    this.shadow.visible = !this.ghost;
    this.shadow.position.y = groundY - this.root.position.y + 0.01;
  }

  /** Присесть или встать. Переход плавный — его делает animate. */
  setCrouch(crouching: boolean, _dt?: number): void {
    this.crouching = crouching;
  }

  /** Ищущий держит краскомёт в правой руке. Видят все — так понятно, кто ищет. */
  setArmed(armed: boolean): void {
    if (armed === !!this.blaster) return;
    if (armed) {
      this.blaster = new Blaster();
      // Ось краскомёта +Z (куда стреляет) должна смотреть вдоль кисти, от локтя к пальцам — это −Y кости.
      this.blaster.root.rotation.x = Math.PI / 2;
      this.blaster.root.position.set(0, -0.06, 0.02);
      // Игрушечный масштаб: крупнее настоящего — силуэт ищущего читается издалека и со спины.
      this.blaster.root.scale.setScalar(1.5);
      this.bones.handRight.add(this.blaster.root);
    } else {
      this.blaster!.root.removeFromParent();
      this.blaster = null;
    }
  }

  get armed(): boolean {
    return !!this.blaster;
  }

  /**
   * Выстрел: рука вытягивается к цели (pitch — угол к горизонту, рад), отдача подбрасывает руку и корпус.
   * Отдача — это толчок скорости суставам-пружинам: они сами отыграют назад, с лёгким покачиванием.
   * reload — сколько секунд бак будет наполняться (видно, когда можно стрелять снова).
   */
  fire(pitch: number, reload: number): void {
    this.aimTime = 0.9;
    this.aimPitch = pitch;
    this.velocity[partIndex('upperArmRight') * 3] -= 7;
    this.velocity[partIndex('forearmRight') * 3] -= 4;
    this.velocity[partIndex('torso') * 3] -= 1.6;
    this.velocity[partIndex('head') * 3] -= 1;
    this.reloadElapsed = 0;
    this.reloadTotal = Math.max(0.1, reload);
    this.blaster?.setPaintLevel(0);
  }

  /** Сервер сообщил настоящую перезарядку (попадание короче промаха) — бак наполняется за это время. */
  setReload(seconds: number): void {
    this.reloadTotal = Math.max(0.1, this.reloadElapsed + seconds);
  }

  /** Где кончик сопла в мире — оттуда летит краска. false — краскомёта нет. */
  muzzlePosition(target: THREE.Vector3): boolean {
    if (!this.blaster) return false;
    this.root.updateMatrixWorld(true);
    this.blaster.muzzle.getWorldPosition(target);
    return true;
  }

  /** Лезет или висит на стене; speed — скорость по стене (м/с): висит — 0, руки замирают. */
  setClimbing(climbing: boolean, speed: number): void {
    this.climbing = climbing;
    this.climbSpeed01 = Math.min(1, speed / PLAYER.climbSpeed);
  }

  /** Поза для пряток ('none' — обычное состояние). Переход плавный — его делает animate. */
  setPose(pose: Pose): void {
    this.pose = pose;
  }

  /**
   * Мгновенно встать в положение — без пружин, шага и дыхания. Результат всегда одинаковый:
   * по нему генерируются хитбоксы поз (см. test/player/pose-hitboxes.test.ts).
   */
  holdStance(key: StanceKey): void {
    this.applyPose(key === 'stand' ? STAND : key === 'crouch' ? CROUCH : POSE_LIBRARY[key]);
    this.current.set(this.target);
    this.velocity.fill(0);
    this.writeBones();
  }

  /** Каждый кадр. speed01 — горизонтальная скорость в долях скорости ходьбы: 1 — шаг, больше — бег. */
  animate(dt: number, speed01: number, grounded: boolean): void {
    let spring = SPRING_WALK;
    if (this.studioPose) {
      this.applyPose(STUDIO);
    } else if (this.pose !== 'none') {
      this.applyPose(POSE_LIBRARY[this.pose]);
      spring = SPRING_POSE;
      // Ползком: доля от скорости ползания этой позы (она намного меньше скорости ходьбы).
      const crawlSpeed = POSE_RULES[this.pose].speed;
      if (crawlSpeed > 0) this.addCrawl(dt, Math.min(1, (speed01 * PLAYER.walkSpeed) / crawlSpeed));
      else this.addBreath(dt, 0.6);
    } else if (this.climbing) {
      this.applyPose(CLIMB);
      this.addClimb(dt);
    } else if (!grounded) {
      this.applyPose(JUMP);
    } else {
      this.applyPose(this.crouching ? CROUCH : STAND);
      this.addWalk(dt, speed01);
      this.addBreath(dt, 1);
    }
    if (this.blaster) this.holdBlaster(dt);
    this.integrate(Math.min(dt, 0.1), spring);
    this.writeBones();
    this.updateHitboxView();
  }

  /**
   * Правая рука держит краскомёт: в обычной стойке — у пояса стволом вперёд,
   * после выстрела — вытянута к цели. В позе и в Мастерской рука свободна (поза важнее).
   */
  private holdBlaster(dt: number): void {
    this.reloadElapsed += dt;
    this.blaster!.setPaintLevel(this.reloadElapsed / this.reloadTotal);
    if (this.aimTime > 0) this.aimTime -= dt;
    if (this.studioPose || this.pose !== 'none') return;
    const arm = partIndex('upperArmRight') * 3;
    const forearm = partIndex('forearmRight') * 3;
    const hand = partIndex('handRight') * 3;
    if (this.aimTime > 0) {
      // Рука прямая, направлена к цели: −π/2 — горизонтально вперёд, больше по модулю — выше.
      this.target[arm] = -Math.PI / 2 - this.aimPitch;
      this.target[arm + 2] = 0.04; // чуть наружу — бак краскомёта не заходит в голову
      this.target[forearm] = 0;
      this.target[hand] = 0;
    } else {
      // Наготове: локоть у бока, предплечье горизонтально — ствол у пояса смотрит вперёд.
      this.target[arm] = -0.25;
      this.target[arm + 2] = 0.18;
      this.target[forearm] = -1.3;
      this.target[hand] = 0;
    }
  }

  private updateHitboxView(): void {
    if (!PlayerModel.showHitboxes) {
      if (this.hitboxView) this.hitboxView.visible = false;
      return;
    }
    if (!this.hitboxView) {
      this.hitboxView = hitboxLines('stand');
      this.root.add(this.hitboxView);
    }
    this.hitboxView.visible = true;
    this.hitboxView.geometry = geometryFor(stanceKey({ crouching: this.crouching, pose: this.pose }));
  }

  // ---------- Позы ----------

  /** Целевая поза = базовая поза (остальное — нули, то есть поза покоя). */
  private applyPose(pose: BodyPose): void {
    this.target.fill(0);
    for (const [part, angles] of Object.entries(pose.joints) as [BodyZone, readonly number[]][]) {
      this.target.set(angles, partIndex(part) * 3);
    }
    this.target[HIP_Y_CH] = pose.hipY;
    this.target[HIP_Z_CH] = pose.hipZ ?? 0;
    this.target[HIP_PITCH_CH] = pose.hipPitch ?? 0;
  }

  private integrate(dt: number, { omega, zeta }: { omega: number; zeta: number }): void {
    const k = omega * omega;
    const c = 2 * zeta * omega;
    for (let left = dt; left > 1e-6; left -= SPRING_STEP) {
      const h = Math.min(SPRING_STEP, left);
      for (let i = 0; i < CHANNELS; i++) {
        // Полунеявный Эйлер: сначала скорость, потом положение по новой скорости — устойчивее явного.
        this.velocity[i] += (k * (this.target[i] - this.current[i]) - c * this.velocity[i]) * h;
        this.current[i] += this.velocity[i] * h;
      }
    }
  }

  private add(part: BodyZone, axis: 0 | 1 | 2, value: number): void {
    this.target[partIndex(part) * 3 + axis] += value;
  }

  /**
   * Шаг: бёдра качаются, колено сгибается, пока нога идёт вперёд (её надо пронести над полом),
   * руки — в противофазе ногам, таз чуть проседает в широком шаге, корпус слегка поворачивается.
   * В приседе шаги мельче. Быстрее шага — бег: шаги чаще и шире, колени выше, локти согнуты,
   * корпус наклонён вперёд. Наклон умеренный: голова не должна выходить из коробки попадания стойки.
   */
  private addWalk(dt: number, speed01: number): void {
    const walk = Math.min(1, speed01);
    const run = Math.min(1, Math.max(0, (speed01 - 1) / (PLAYER.sprintSpeed / PLAYER.walkSpeed - 1)));
    const stride = walk * (this.crouching ? 0.45 : 1);
    this.walkPhase += dt * (4 + 8 * walk + 5 * run);
    if (stride < 0.01) return;
    const sin = Math.sin(this.walkPhase);
    const cos = Math.cos(this.walkPhase);
    const swing = sin * (0.65 + 0.2 * run) * stride;
    const kneeLeft = Math.max(0, -cos) * (1.1 + 0.5 * run) * stride;
    const kneeRight = Math.max(0, cos) * (1.1 + 0.5 * run) * stride;

    this.add('thighLeft', 0, swing);
    this.add('thighRight', 0, -swing);
    this.add('shinLeft', 0, kneeLeft);
    this.add('shinRight', 0, kneeRight);
    this.add('footLeft', 0, -kneeLeft * 0.4);
    this.add('footRight', 0, -kneeRight * 0.4);
    this.add('upperArmLeft', 0, -swing * (0.8 + 0.3 * run));
    this.add('upperArmRight', 0, swing * (0.8 + 0.3 * run));
    this.add('forearmLeft', 0, -(0.3 + 0.9 * run) * stride);
    this.add('forearmRight', 0, -(0.3 + 0.9 * run) * stride);
    this.add('torso', 0, (0.06 + 0.1 * run) * stride);
    this.add('torso', 1, swing * 0.18);
    this.add('head', 1, -swing * 0.12);
    this.target[HIP_Y_CH] -= Math.abs(sin) * 0.03 * stride;
  }

  /**
   * Ползание. На четвереньках — как ходьба на четырёх: по диагонали левая рука с правой ногой.
   * Пластом — «по-пластунски»: руки и ноги загребают по полу в стороны, тело чуть виляет.
   */
  private addCrawl(dt: number, amount: number): void {
    this.walkPhase += dt * (3 + 5 * amount);
    if (amount < 0.01) return;
    const sin = Math.sin(this.walkPhase);
    const lift = (phase: number) => Math.max(0, Math.cos(phase)) * amount;
    if (this.pose === 'crawl') {
      const swing = sin * 0.35 * amount;
      this.add('upperArmLeft', 0, -swing);
      this.add('thighRight', 0, swing * 0.8);
      this.add('upperArmRight', 0, swing);
      this.add('thighLeft', 0, -swing * 0.8);
      // Рука, идущая вперёд, сгибается в локте — отрывается от пола.
      this.add('forearmLeft', 0, -0.4 * lift(this.walkPhase));
      this.add('forearmRight', 0, -0.4 * lift(this.walkPhase + Math.PI));
      this.add('torso', 1, sin * 0.08 * amount);
    } else {
      const sweep = sin * 0.45 * amount;
      this.add('upperArmLeft', 2, -Math.max(0, sweep));
      this.add('upperArmRight', 2, Math.max(0, -sweep));
      this.add('thighLeft', 2, -Math.max(0, -sweep) * 0.5);
      this.add('thighRight', 2, Math.max(0, sweep) * 0.5);
      this.add('shinLeft', 0, lift(this.walkPhase) * 0.6);
      this.add('shinRight', 0, lift(this.walkPhase + Math.PI) * 0.6);
      this.add('torso', 2, sin * 0.06 * amount);
    }
  }

  /**
   * Лазание: рука и противоположная нога тянутся вверх по очереди, как на скалодроме.
   * Висит — почти неподвижен, только дышит: висящий прячущийся не должен «дёргаться».
   */
  private addClimb(dt: number): void {
    const amount = this.climbSpeed01;
    this.walkPhase += dt * (2 + 7 * amount);
    if (amount < 0.05) {
      this.addBreath(dt, 0.4);
      return;
    }
    const reach = Math.sin(this.walkPhase) * 0.45 * amount;
    this.add('upperArmLeft', 0, -reach);
    this.add('upperArmRight', 0, reach);
    this.add('forearmLeft', 0, -Math.max(0, reach));
    this.add('forearmRight', 0, -Math.max(0, -reach));
    this.add('thighLeft', 0, reach * 0.8);
    this.add('thighRight', 0, -reach * 0.8);
    this.add('shinLeft', 0, Math.max(0, -reach) * 0.8);
    this.add('shinRight', 0, Math.max(0, reach) * 0.8);
    this.add('torso', 2, reach * 0.15);
  }

  /**
   * Дыхание: корпус чуть покачивается, плечи поднимаются. Стоящий персонаж выглядит живым, а не статуей.
   * В позе дышит слабее — замерший прячущийся почти неподвижен, но не «мёртв».
   */
  private addBreath(dt: number, strength: number): void {
    this.breathPhase += dt * 2.2;
    const b = Math.sin(this.breathPhase) * strength;
    this.add('torso', 0, 0.015 * b);
    this.add('head', 0, -0.012 * b);
    this.add('upperArmLeft', 2, -0.02 * b);
    this.add('upperArmRight', 2, 0.02 * b);
  }

  private writeBones(): void {
    PART_ORDER.forEach((part, i) => {
      this.bones[part].rotation.set(this.current[i * 3], this.current[i * 3 + 1], this.current[i * 3 + 2]);
    });
    this.pelvis.position.y = this.current[HIP_Y_CH];
    this.pelvis.position.z = this.current[HIP_Z_CH];
    this.pelvis.rotation.x = this.current[HIP_PITCH_CH];
  }

  /**
   * Глаза — показывают, куда смотрит персонаж. Не красятся (это не кожа).
   * Овальные, с бликом — так персонаж выглядит дружелюбнее. Обе пары — одна сетка (один вызов отрисовки).
   */
  private createEyes(): THREE.Mesh {
    const head = CHARACTER_PARTS.head;
    const parts: THREE.BufferGeometry[] = [];
    const add = (geometry: THREE.BufferGeometry, color: string, matrix: THREE.Matrix4) => {
      geometry.applyMatrix4(matrix);
      const c = new THREE.Color(color);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(geometry);
    };

    for (const side of [-1, 1]) {
      // Точка на скруглённой передней грани головы — глаз «сидит» на поверхности, а не висит в воздухе.
      const { point, normal } = roundBoxPoint({ x: side * 0.1, y: 0.03, z: head.size.d / 2 }, head.size, head.radius);
      const n = new THREE.Vector3(normal.x, normal.y, normal.z);
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const at = new THREE.Vector3(head.center.x + point.x, head.center.y + point.y, head.center.z + point.z);

      const eye = new THREE.Matrix4().compose(at, rotation, new THREE.Vector3(0.036, 0.054, 0.016));
      add(new THREE.SphereGeometry(1, 16, 12), '#1b1f2a', eye);

      const glintAt = at.clone().add(new THREE.Vector3(0.012, 0.022, 0).applyQuaternion(rotation)).addScaledVector(n, 0.012);
      const glint = new THREE.Matrix4().compose(glintAt, rotation, new THREE.Vector3(0.011, 0.011, 0.006));
      add(new THREE.SphereGeometry(1, 8, 6), '#ffffff', glint);
    }
    const eyes = new THREE.Mesh(mergeGeometries(parts), this.eyeMaterial);
    for (const geometry of parts) geometry.dispose();
    eyes.name = 'eyes';
    return eyes;
  }
}
