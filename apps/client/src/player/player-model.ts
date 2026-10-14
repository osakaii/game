import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY_ZONES, skinBaseColor, type BodyZone, type SkinBase } from '@mecha/shared';
import { graphics } from '../platform/graphics';
import { getSkinAtlas } from '../skin/atlas';
import { buildBodyGeometry } from '../skin/body-geometry';
import { CHARACTER_PARTS, HIP_Y, PART_ORDER, partIndex } from '../skin/character-parts';
import { roundBoxPoint } from '../skin/rounded-box';
import { SkinTexture } from '../skin/skin-texture';

/** Повороты суставов позы (рад, порядок осей XYZ) и положение таза. */
interface BodyPose {
  hipY: number;
  /** Сдвиг таза назад/вперёд: в приседе таз уходит назад, чтобы корпус и голова остались над стопами. */
  hipZ?: number;
  joints: Partial<Record<BodyZone, readonly [number, number, number]>>;
}

/**
 * Пара симметричных суставов: левой части — как задано, правой — зеркально.
 * Зеркало по X сохраняет поворот вокруг X (сгиб вперёд-назад), а повороты вокруг Y и Z меняют знак.
 */
function both(
  part: 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot',
  x: number,
  y = 0,
  z = 0,
): Partial<Record<BodyZone, readonly [number, number, number]>> {
  return { [`${part}Left`]: [x, y, z], [`${part}Right`]: [x, -y, -z] };
}

const THIGH = CHARACTER_PARTS.thighLeft.joint.y - CHARACTER_PARTS.shinLeft.joint.y; // длина бедра
const SHIN = -CHARACTER_PARTS.footLeft.joint.y; // длина голени
const ANKLE = HIP_Y - THIGH - SHIN; // высота голеностопа над землёй

/**
 * Высота таза, при которой стопы стоят на полу: бедро и голень — звенья цепочки,
 * их вертикальные проекции складываются (cos угла от вертикали).
 */
function hipOnFeet(thighX: number, shinX: number): number {
  return THIGH * Math.cos(thighX) + SHIN * Math.cos(thighX + shinX) + ANKLE;
}

/** Стоит: руки чуть от тела, локти мягко согнуты — не «солдатик». */
const STAND: BodyPose = {
  hipY: HIP_Y,
  joints: { ...both('upperArm', 0, 0, -0.08), ...both('forearm', -0.15) },
};

/**
 * Присед — «крадущийся»: глубоко на корточках, таз назад, корпус вперёд, голова поднята (смотрит вперёд),
 * руки согнуты перед собой. Углы подобраны так, чтобы макушка влезла в хитбокс приседа
 * PLAYER.crouchHeight, а голова не торчала далеко вперёд из цилиндра физики — это проверяет тест.
 * Стопа доворачивается так, чтобы стоять на полу плоско: сумма углов бедра, голени и стопы = 0.
 */
const CROUCH_THIGH = -1.55;
const CROUCH_SHIN = 2.45;
const CROUCH: BodyPose = {
  hipY: hipOnFeet(CROUCH_THIGH, CROUCH_SHIN),
  hipZ: -0.28,
  joints: {
    torso: [1.15, 0, 0],
    head: [-0.7, 0, 0],
    ...both('thigh', CROUCH_THIGH, 0, -0.12),
    ...both('shin', CROUCH_SHIN),
    ...both('foot', -(CROUCH_THIGH + CROUCH_SHIN)),
    ...both('upperArm', -1.6, 0, -0.18),
    ...both('forearm', -1.0),
  },
};

/** Прыжок: колени поджаты, руки вверх. */
const JUMP: BodyPose = {
  hipY: HIP_Y,
  joints: {
    ...both('thigh', -0.9, 0, -0.06),
    ...both('shin', 1.35),
    ...both('foot', 0.25),
    ...both('upperArm', -2.5, 0, -0.3),
    ...both('forearm', -0.35),
  },
};

/** Манекен для Мастерской: руки и ноги разведены — кисть достаёт до боков торса и внутренней стороны ног. */
const STUDIO: BodyPose = {
  hipY: HIP_Y,
  joints: { ...both('upperArm', 0, 0, -0.38), ...both('thigh', 0, 0, -0.07), ...both('foot', 0, 0, 0.07) },
};

/** Как быстро суставы догоняют целевую позу (1/с): переходы плавные, но походка не «смазывается». */
const POSE_SPEED = 18;

/**
 * Визуальная модель персонажа. Логики и физики здесь нет — только меши и анимация.
 *
 * Тело — один SkinnedMesh («кожа на скелете»): каждая часть жёстко привязана к своей кости.
 * Кости повторяют суставы из CHARACTER_PARTS:
 *   pelvis (таз) ─┬─ torso ─┬─ head (+ глаза)
 *                 │         └─ upperArm ─ forearm ─ hand  (×2)
 *                 └─ thigh ─ shin ─ foot                  (×2)
 *
 * Анимация: каждый кадр собираем целевую позу (стоит/присел/прыжок/Мастерская + шаг + дыхание)
 * и плавно подводим к ней суставы.
 */
export class PlayerModel {
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
  /** Текущие и целевые углы суставов: [x, y, z] на каждую часть, в порядке PART_ORDER. */
  private readonly current = new Float32Array(PART_ORDER.length * 3);
  private readonly target = new Float32Array(PART_ORDER.length * 3);
  private hipCurrent = HIP_Y;
  private hipTarget = HIP_Y;
  private hipZCurrent = 0;
  private hipZTarget = 0;
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
    this.mesh.castShadow = true;
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
    this.hipCurrent = this.hipTarget;
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
      if (object === this.mesh) object.castShadow = !ghost; // у призрака нет тени
      const material = object.material as THREE.Material;
      if (material.transparent === ghost) return;
      material.transparent = ghost;
      material.opacity = ghost ? 0.3 : 1;
      material.depthWrite = !ghost;
      material.needsUpdate = true;
    });
  }

  /** Круглая тень лежит на опоре под персонажем (в прыжке остаётся внизу). Видна, только если настоящие тени выключены. */
  setShadowGround(groundY: number): void {
    this.shadow.visible = !graphics.shadows && !this.ghost;
    this.shadow.position.y = groundY - this.root.position.y + 0.01;
  }

  /** Присесть или встать. Переход плавный — его делает animate. */
  setCrouch(crouching: boolean, _dt?: number): void {
    this.crouching = crouching;
  }

  /** Каждый кадр. speed01 — горизонтальная скорость 0..1 от максимальной. */
  animate(dt: number, speed01: number, grounded: boolean): void {
    if (this.studioPose) {
      this.applyPose(STUDIO);
    } else if (!grounded) {
      this.applyPose(JUMP);
    } else {
      this.applyPose(this.crouching ? CROUCH : STAND);
      this.addWalk(dt, speed01);
      this.addBreath(dt);
    }

    // Экспоненциальное приближение к цели: одинаково плавно при любом FPS.
    const k = 1 - Math.exp(-POSE_SPEED * dt);
    for (let i = 0; i < this.current.length; i++) this.current[i] += (this.target[i] - this.current[i]) * k;
    this.hipCurrent += (this.hipTarget - this.hipCurrent) * k;
    this.hipZCurrent += (this.hipZTarget - this.hipZCurrent) * k;
    this.writeBones();
  }

  // ---------- Позы ----------

  /** Целевая поза = базовая поза (остальное — нули, то есть поза покоя). */
  private applyPose(pose: BodyPose): void {
    this.target.fill(0);
    for (const [part, angles] of Object.entries(pose.joints) as [BodyZone, readonly number[]][]) {
      this.target.set(angles, partIndex(part) * 3);
    }
    this.hipTarget = pose.hipY;
    this.hipZTarget = pose.hipZ ?? 0;
  }

  private add(part: BodyZone, axis: 0 | 1 | 2, value: number): void {
    this.target[partIndex(part) * 3 + axis] += value;
  }

  /**
   * Шаг: бёдра качаются, колено сгибается, пока нога идёт вперёд (её надо пронести над полом),
   * руки — в противофазе ногам, таз чуть проседает в широком шаге, корпус слегка поворачивается.
   * В приседе шаги мельче.
   */
  private addWalk(dt: number, speed01: number): void {
    const stride = speed01 * (this.crouching ? 0.45 : 1);
    this.walkPhase += dt * (4 + 8 * speed01);
    if (stride < 0.01) return;
    const sin = Math.sin(this.walkPhase);
    const cos = Math.cos(this.walkPhase);
    const swing = sin * 0.65 * stride;
    const kneeLeft = Math.max(0, -cos) * 1.1 * stride;
    const kneeRight = Math.max(0, cos) * 1.1 * stride;

    this.add('thighLeft', 0, swing);
    this.add('thighRight', 0, -swing);
    this.add('shinLeft', 0, kneeLeft);
    this.add('shinRight', 0, kneeRight);
    this.add('footLeft', 0, -kneeLeft * 0.4);
    this.add('footRight', 0, -kneeRight * 0.4);
    this.add('upperArmLeft', 0, -swing * 0.8);
    this.add('upperArmRight', 0, swing * 0.8);
    this.add('forearmLeft', 0, -0.3 * stride);
    this.add('forearmRight', 0, -0.3 * stride);
    this.add('torso', 0, 0.06 * stride);
    this.add('torso', 1, swing * 0.18);
    this.add('head', 1, -swing * 0.12);
    this.hipTarget -= Math.abs(sin) * 0.03 * stride;
  }

  /** Дыхание: корпус чуть покачивается, плечи поднимаются. Стоящий персонаж выглядит живым, а не статуей. */
  private addBreath(dt: number): void {
    this.breathPhase += dt * 2.2;
    const b = Math.sin(this.breathPhase);
    this.add('torso', 0, 0.015 * b);
    this.add('head', 0, -0.012 * b);
    this.add('upperArmLeft', 2, -0.02 * b);
    this.add('upperArmRight', 2, 0.02 * b);
  }

  private writeBones(): void {
    PART_ORDER.forEach((part, i) => {
      this.bones[part].rotation.set(this.current[i * 3], this.current[i * 3 + 1], this.current[i * 3 + 2]);
    });
    this.pelvis.position.y = this.hipCurrent;
    this.pelvis.position.z = this.hipZCurrent;
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
