import * as THREE from 'three';
import { BODY_ZONES, PLAYER, skinBaseColor, type BodyZone, type SkinBase } from '@mecha/shared';
import { graphics } from '../platform/graphics';
import { applyAtlasUVs, getSkinAtlas } from '../skin/atlas';
import { CHARACTER_PARTS } from '../skin/character-parts';
import { SkinTexture } from '../skin/skin-texture';

const HIP_Y = 0.6;
const LEG_LENGTH = CHARACTER_PARTS.legLeft.h;
/** Угол ног в приседе (рад): почти горизонтально вперёд, как сидя на корточках. */
const CROUCH_LEG_ANGLE = -1.1;
/** Бёдра в приседе — ровно на высоте, при которой согнутые ноги касаются пола. */
const CROUCH_HIP_Y = LEG_LENGTH * Math.cos(CROUCH_LEG_ANGLE);
/** Верх тела (от бедра до макушки = 1 м) сжимаем так, чтобы макушка была на PLAYER.crouchHeight. */
const UPPER_HEIGHT = PLAYER.height - HIP_Y;
const CROUCH_UPPER_SCALE = (PLAYER.crouchHeight - CROUCH_HIP_Y) / UPPER_HEIGHT;
const CROUCH_SPEED = 10; // как быстро модель приседает/встаёт (1/с)
/** Руки в Мастерской отведены в стороны (рад) — не загораживают бока торса от кисти. */
const STUDIO_ARM_ANGLE = 0.35;

/**
 * Визуальная модель персонажа из примитивов. Логики и физики здесь нет — только меши и анимация.
 *
 * Иерархия:
 *   root ── body ─┬─ legLeft/legRight (шарнир в бедре)
 *          │      └─ upper (бедро) ─┬─ torso, head
 *          │                        └─ armLeft/armRight (шарнир в плече)
 *          └─ shadow (круглая тень, когда настоящие выключены)
 *
 * Конечности висят на «шарнирах» (pivot-группах): вращаем pivot — конечность качается вокруг сустава.
 * Верх тела — тоже группа с опорой в бедре: в приседе её опускаем и сжимаем относительно бедра.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  readonly zones = {} as Record<BodyZone, THREE.Mesh>;
  /**
   * Кожа персонажа: одна текстура на все части тела, разложенные по атласу.
   * Один материал на персонажа вместо шести — на видеокарту уходит меньше переключений состояния.
   */
  readonly skin = new SkinTexture(getSkinAtlas());
  private readonly material = new THREE.MeshLambertMaterial({ map: this.skin.texture });
  private base: SkinBase = 'default';

  private readonly body = new THREE.Group();
  private readonly upper = new THREE.Group();
  private readonly legLeft = new THREE.Group();
  private readonly legRight = new THREE.Group();
  private readonly armLeft = new THREE.Group();
  private readonly armRight = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private walkPhase = 0;
  private crouchAmount = 0;
  private ghost = false;
  private studioPose = false;

  constructor() {
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

    // Пропорции: ноги 0–0.6, торс 0.6–1.16, голова 1.18–1.6 (рост = PLAYER.height).
    // Размеры частей — в CHARACTER_PARTS (по ним же построен атлас текстуры).
    // Внутри upper координаты отсчитываются от бедра (y = 0 — это 0.6 м над землёй).
    this.upper.position.y = HIP_Y;
    this.addLimb('legLeft', this.legLeft, -0.13, HIP_Y, this.body);
    this.addLimb('legRight', this.legRight, 0.13, HIP_Y, this.body);
    this.addLimb('armLeft', this.armLeft, -0.38, 1.12 - HIP_Y, this.upper);
    this.addLimb('armRight', this.armRight, 0.38, 1.12 - HIP_Y, this.upper);

    const torso = this.createZone('torso');
    torso.position.y = 0.88 - HIP_Y;
    const head = this.createZone('head');
    head.position.y = 1.39 - HIP_Y;
    this.upper.add(torso, head);
    this.body.add(this.upper);

    // Глаза показывают, куда смотрит персонаж (+Z — «вперёд» модели). Они не красятся.
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#1b1f2a' });
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(box(0.07, 0.1, 0.02), eyeMaterial);
      eye.position.set(x, 0.03, 0.215);
      head.add(eye);
    }

    // Все части тела отбрасывают настоящую тень (если тени включены).
    this.body.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });

    // Круглая «тень» — дешёвая замена настоящим теням, помогает понять высоту прыжка.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.body, this.shadow);
    this.setBase('default');
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

  /** Поза манекена для Мастерской: стоит ровно, руки чуть в стороны. */
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
  }

  /**
   * Призрак — найденный прячущийся: полупрозрачный, наблюдает за раундом.
   * Смена transparent требует needsUpdate: three.js пересоберёт шейдер материала.
   */
  setGhost(ghost: boolean): void {
    this.ghost = ghost;
    this.body.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = !ghost; // у призрака нет тени
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

  /** Плавный переход в присед и обратно. Вызывается каждый кадр, до animate. */
  setCrouch(crouching: boolean, dt: number): void {
    const target = crouching ? 1 : 0;
    this.crouchAmount += (target - this.crouchAmount) * (1 - Math.exp(-CROUCH_SPEED * dt));
    const a = this.crouchAmount;
    const hipY = HIP_Y + (CROUCH_HIP_Y - HIP_Y) * a;
    this.legLeft.position.y = this.legRight.position.y = hipY;
    this.upper.position.y = hipY;
    this.upper.scale.y = 1 + (CROUCH_UPPER_SCALE - 1) * a;
  }

  /** speed01 — горизонтальная скорость 0..1 от максимальной. */
  animate(dt: number, speed01: number, grounded: boolean): void {
    this.armLeft.rotation.z = this.studioPose ? -STUDIO_ARM_ANGLE : 0;
    this.armRight.rotation.z = this.studioPose ? STUDIO_ARM_ANGLE : 0;
    if (this.studioPose) {
      this.legLeft.rotation.x = this.legRight.rotation.x = 0;
      this.armLeft.rotation.x = this.armRight.rotation.x = 0;
      return;
    }
    if (!grounded) {
      // В прыжке поджимаем ноги и поднимаем руки.
      this.legLeft.rotation.x = this.legRight.rotation.x = -0.5;
      this.armLeft.rotation.x = this.armRight.rotation.x = -2.4;
      return;
    }
    // В приседе шагаем мельче, ноги качаются вокруг согнутого положения.
    const a = this.crouchAmount;
    this.walkPhase += dt * (4 + 8 * speed01);
    const swing = Math.sin(this.walkPhase) * 0.7 * speed01 * (1 - 0.6 * a);
    const legBase = CROUCH_LEG_ANGLE * a;
    this.legLeft.rotation.x = legBase + swing;
    this.legRight.rotation.x = legBase - swing;
    this.armLeft.rotation.x = -swing - 0.4 * a; // в приседе руки чуть вперёд
    this.armRight.rotation.x = swing - 0.4 * a;
  }

  private createZone(zone: BodyZone): THREE.Mesh {
    const size = CHARACTER_PARTS[zone];
    const geometry = new THREE.BoxGeometry(size.w, size.h, size.d);
    // Стандартные UV (каждая грань — весь квадрат 0..1) заменяем на прямоугольники атласа.
    applyAtlasUVs(geometry, zone, getSkinAtlas());
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = zone;
    this.zones[zone] = mesh;
    return mesh;
  }

  private addLimb(zone: BodyZone, pivot: THREE.Group, x: number, jointY: number, parent: THREE.Object3D) {
    const mesh = this.createZone(zone);
    mesh.position.y = -CHARACTER_PARTS[zone].h / 2;
    pivot.position.set(x, jointY, 0);
    pivot.add(mesh);
    parent.add(pivot);
  }
}
