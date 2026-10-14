import * as THREE from 'three';
import { Emitter } from '../core/emitter';
import type { Eyedropper } from '../painting/eyedropper';
import type { PlayerModel } from '../player/player-model';
import { PART_ORDER } from '../skin/character-parts';
import type { WorldGeometry } from '../world/active-map';
import { STAMP_SPACING, interpolateStamps, type Point3 } from './brush-stamps';
import type { SkinPainter, Stamp } from './skin-painter';
import { StudioCamera } from './studio-camera';

export type StudioTool = 'brush' | 'eyedropper';

/** Второй палец пришёл так быстро после первого — значит, это был жест, а не начало мазка. */
const GESTURE_GRACE_MS = 250;
const ORBIT_SENSITIVITY = 0.008;
const RECENT_LIMIT = 6;

interface BodyHit {
  part: number;
  local: THREE.Vector3;
  localNormal: THREE.Vector3;
  world: THREE.Vector3;
  worldNormal: THREE.Vector3;
  uv: THREE.Vector2;
}

interface Stroke {
  pointerId: number;
  part: number;
  last: Point3;
  carried: number;
  startedAt: number;
}

interface StudioDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  world: WorldGeometry;
  model: PlayerModel;
  painter: SkinPainter;
  eyedropper: Eyedropper;
}

/**
 * Мастерская: режим покраски своего персонажа.
 *
 * Жесты:
 *   1 палец на теле      — мазок кистью;
 *   1 палец мимо тела    — облёт камерой;
 *   2 пальца             — облёт + щипок для зума;
 *   мышь: левая на теле — кисть, левая мимо / правая — облёт, колесо — зум.
 */
export class PaintStudio extends Emitter<{ change: void }> {
  active = false;
  tool: StudioTool = 'brush';
  readonly color = new THREE.Color('#e63946');
  colorHex = '#e63946';
  /** Радиус кисти, м. */
  radius = 0.05;
  hardness = 0.6;
  recent: string[] = [];

  private readonly studioCamera: StudioCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private stroke: Stroke | null = null;
  private pinchDistance = 0;
  private readonly cursor: THREE.Mesh;
  private readonly lookTarget = new THREE.Vector3();

  constructor(private readonly deps: StudioDeps) {
    super();
    this.studioCamera = new StudioCamera(deps.camera, deps.world);

    // Кольцо-курсор: показывает, куда и каким размером ляжет мазок.
    this.cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false }),
    );
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    deps.scene.add(this.cursor);

    const c = deps.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('pointerleave', () => (this.cursor.visible = this.stroke !== null));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  open(facing: number): void {
    this.active = true;
    this.tool = 'brush';
    this.studioCamera.frameFront(facing);
    this.deps.model.setStudioPose(true);
    this.emit('change', undefined);
  }

  close(): void {
    if (!this.active) return;
    this.endStroke();
    this.active = false;
    this.pointers.clear();
    this.cursor.visible = false;
    this.deps.model.setStudioPose(false);
    this.emit('change', undefined);
  }

  /** Каждый кадр, пока Мастерская открыта. */
  update(playerPosition: THREE.Vector3): void {
    this.lookTarget.copy(playerPosition);
    this.studioCamera.update(this.lookTarget);
  }

  setColor(hex: string): void {
    this.colorHex = hex;
    this.color.set(hex);
    this.emit('change', undefined);
  }

  setTool(tool: StudioTool): void {
    this.tool = tool;
    this.emit('change', undefined);
  }

  undo(): void {
    this.deps.painter.undo();
    this.emit('change', undefined);
  }

  redo(): void {
    this.deps.painter.redo();
    this.emit('change', undefined);
  }

  // ---------- Ввод ----------

  private onDown(e: PointerEvent) {
    if (!this.active) return;
    e.preventDefault();
    try {
      this.deps.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* быстрый тап — палец уже отпущен */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      // Второй палец: начатый мазок был, скорее всего, частью жеста.
      if (this.stroke && performance.now() - this.stroke.startedAt < GESTURE_GRACE_MS) {
        this.deps.painter.cancelStroke();
        this.stroke = null;
        this.emit('change', undefined);
      } else {
        this.endStroke();
      }
      this.pinchDistance = this.currentPinchDistance();
      return;
    }
    if (this.pointers.size > 2) return;

    if (this.tool === 'eyedropper' && e.button === 0) {
      this.pickColor(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return; // правая кнопка мыши — только облёт (в onMove)

    const hit = this.raycastBody(e.clientX, e.clientY);
    if (hit) this.startStroke(e.pointerId, hit);
  }

  private onMove(e: PointerEvent) {
    if (!this.active) return;
    const previous = this.pointers.get(e.pointerId);

    if (!previous) {
      // Мышь без нажатия — просто показываем курсор кисти.
      if (e.pointerType === 'mouse') this.showCursor(this.raycastBody(e.clientX, e.clientY));
      return;
    }

    if (this.stroke?.pointerId === e.pointerId) {
      this.continueStroke(this.raycastBody(e.clientX, e.clientY));
    } else if (this.pointers.size === 1) {
      this.studioCamera.orbit((e.clientX - previous.x) * ORBIT_SENSITIVITY, (e.clientY - previous.y) * ORBIT_SENSITIVITY);
    } else if (this.pointers.size === 2) {
      // Два пальца: середина двигается — облёт, расстояние меняется — зум.
      const [a, b] = [...this.pointers.values()];
      const midBefore = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a2, b2] = [...this.pointers.values()];
      const midAfter = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
      this.studioCamera.orbit((midAfter.x - midBefore.x) * ORBIT_SENSITIVITY, (midAfter.y - midBefore.y) * ORBIT_SENSITIVITY);
      const distance = this.currentPinchDistance();
      if (this.pinchDistance > 0 && distance > 0) this.studioCamera.zoom(this.pinchDistance / distance);
      this.pinchDistance = distance;
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  private onUp(e: PointerEvent) {
    if (this.stroke?.pointerId === e.pointerId) this.endStroke();
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (e.pointerType !== 'mouse') this.cursor.visible = false;
  }

  private onWheel(e: WheelEvent) {
    if (!this.active) return;
    e.preventDefault();
    this.studioCamera.zoom(Math.exp(e.deltaY * 0.001));
  }

  // ---------- Мазок ----------

  private startStroke(pointerId: number, hit: BodyHit) {
    this.deps.painter.beginStroke();
    this.stroke = { pointerId, part: hit.part, last: hit.local.clone(), carried: 0, startedAt: performance.now() };
    this.paint([{ center: hit.local.clone(), normal: hit.localNormal.clone() }], hit.part);
    this.showCursor(hit);
    this.emit('change', undefined);
  }

  private continueStroke(hit: BodyHit | null) {
    const stroke = this.stroke;
    this.showCursor(hit);
    if (!stroke || !hit) return; // палец ушёл с тела — ждём, пока вернётся

    if (hit.part !== stroke.part) {
      // Перешли на другую часть тела (с руки на торс) — между ними пустота, не интерполируем.
      stroke.part = hit.part;
      stroke.last = hit.local.clone();
      stroke.carried = 0;
      this.paint([{ center: hit.local.clone(), normal: hit.localNormal.clone() }], hit.part);
      return;
    }
    const { points, carried } = interpolateStamps(stroke.last, hit.local, this.radius * STAMP_SPACING, stroke.carried);
    stroke.carried = carried;
    stroke.last = hit.local.clone();
    if (points.length) this.paint(points.map((center) => ({ center, normal: hit.localNormal.clone() })), hit.part);
  }

  private endStroke() {
    if (!this.stroke) return;
    this.stroke = null;
    this.remember(this.colorHex);
    this.emit('change', undefined);
  }

  private paint(stamps: Stamp[], part: number) {
    this.deps.painter.stamp(stamps, {
      part,
      radius: this.radius,
      hardness: this.hardness,
      opacity: 1,
      color: this.color,
    });
  }

  // ---------- Пипетка ----------

  /** Тап по себе — цвет своей кожи, тап по миру — цвет предмета. Потом снова кисть. */
  private pickColor(x: number, y: number) {
    const hit = this.raycastBody(x, y);
    const picked = hit ? this.deps.painter.readColor(hit.uv.x, hit.uv.y) : this.deps.eyedropper.pick(x, y);
    if (picked) {
      this.setColor(picked);
      this.remember(picked);
    }
    this.setTool('brush');
  }

  private remember(hex: string) {
    this.recent = [hex, ...this.recent.filter((c) => c !== hex)].slice(0, RECENT_LIMIT);
  }

  // ---------- Луч в тело ----------

  private raycastBody(clientX: number, clientY: number): BodyHit | null {
    const rect = this.deps.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    const meshes = Object.values(this.deps.model.zones);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit || !hit.face || !hit.uv) return null;

    const mesh = hit.object as THREE.Mesh;
    // Точка и нормаль — в системе координат части тела: в ней же построена карта позиций.
    const local = mesh.worldToLocal(hit.point.clone());
    const localNormal = hit.face.normal.clone();
    const worldNormal = localNormal.clone().transformDirection(mesh.matrixWorld);
    return {
      part: PART_ORDER.indexOf(mesh.name as (typeof PART_ORDER)[number]) + 1,
      local,
      localNormal,
      world: hit.point.clone(),
      worldNormal,
      uv: hit.uv.clone(),
    };
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private showCursor(hit: BodyHit | null) {
    if (!hit || this.tool !== 'brush') {
      this.cursor.visible = false;
      return;
    }
    this.cursor.visible = true;
    this.cursor.position.copy(hit.world).addScaledVector(hit.worldNormal, 0.003);
    this.cursor.lookAt(hit.world.clone().add(hit.worldNormal));
    this.cursor.scale.setScalar(this.radius);
  }
}
