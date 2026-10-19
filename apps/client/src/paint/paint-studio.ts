import * as THREE from 'three';
import type { BodyZone } from '@mecha/shared';
import { Emitter } from '../core/emitter';
import type { Eyedropper } from '../painting/eyedropper';
import type { PlayerModel } from '../player/player-model';
import { PART_ORDER, mirrorPart, partsLinked } from '../skin/character-parts';
import type { WorldGeometry } from '../world/active-map';
import { STAMP_SPACING, interpolateStamps, type Point3 } from './brush-stamps';
import type { BrushMode, SkinPainter, Stamp } from './skin-painter';
import { StudioCamera } from './studio-camera';

export type StudioTool = BrushMode | 'eyedropper';

/** Событие мазка — для звука кисти и вибрации. speed — скорость пальца по телу, м/с. */
export interface StrokeEvent {
  state: 'start' | 'move' | 'end';
  speed: number;
}

/** Второй палец пришёл так быстро после первого — значит, это был жест, а не начало мазка. */
const GESTURE_GRACE_MS = 250;
const ORBIT_SENSITIVITY = 0.008;
const RECENT_LIMIT = 8;

interface BodyHit {
  part: BodyZone;
  /** Точка и нормаль в позе покоя (система модели) — в ней работает кисть, см. position-map. */
  local: THREE.Vector3;
  localNormal: THREE.Vector3;
  world: THREE.Vector3;
  worldNormal: THREE.Vector3;
  uv: THREE.Vector2;
}

interface Stroke {
  pointerId: number;
  part: BodyZone;
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
export class PaintStudio extends Emitter<{ change: void; edited: void; stroke: StrokeEvent }> {
  active = false;
  tool: StudioTool = 'brush';
  readonly color = new THREE.Color('#e63946');
  colorHex = '#e63946';
  /** Радиус кисти, м. */
  radius = 0.05;
  hardness = 0.6;
  /** Плотность краски: 1 — кроет полностью, меньше — просвечивает (можно смешивать слоями). */
  opacity = 1;
  recent: string[] = [];
  /** Цвет фона, взятый пипеткой с предмета, — палитра сравнивает с ним цвет кисти. */
  reference: string | null = null;
  /** Симметрия: мазок повторяется зеркально (левая рука ↔ правая, половинки головы и торса). */
  symmetry = false;
  /** «Глазами ищущего»: камера отъезжает на типичное расстояние поиска, красить нельзя. */
  previewing = false;
  /** Последний инструмент рисования — к нему возвращаемся после пипетки. */
  private lastPaintTool: BrushMode = 'brush';
  private lastStrokeTime = 0;

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

  /** position — где стоит персонаж: камера выбирает сторону, где есть место (не упираясь в стену). */
  open(facing: number, position: THREE.Vector3): void {
    this.active = true;
    this.tool = this.lastPaintTool;
    this.previewing = false;
    this.lookTarget.copy(position);
    this.studioCamera.frameOpen(facing, this.lookTarget);
    this.deps.model.setStudioPose(true);
    this.emit('change', undefined);
  }

  close(): void {
    if (!this.active) return;
    this.endStroke();
    this.active = false;
    this.previewing = false;
    this.studioCamera.preview = false;
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

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.emit('change', undefined);
  }

  setTool(tool: StudioTool): void {
    this.tool = tool;
    if (tool !== 'eyedropper') this.lastPaintTool = tool;
    navigator.vibrate?.(6);
    this.emit('change', undefined);
  }

  setSymmetry(enabled: boolean): void {
    this.symmetry = enabled;
    this.emit('change', undefined);
  }

  /** Где держать персонажа на экране (доля ширины от центра) — чтобы панели его не закрывали. */
  setScreenShift(shift: number): void {
    this.studioCamera.screenShift = shift;
  }

  setPreview(enabled: boolean): void {
    this.endStroke();
    this.previewing = enabled;
    this.studioCamera.preview = enabled;
    this.cursor.visible = false;
    this.emit('change', undefined);
  }

  undo(): void {
    this.deps.painter.undo();
    this.emit('change', undefined);
    this.emit('edited', undefined);
  }

  redo(): void {
    this.deps.painter.redo();
    this.emit('change', undefined);
    this.emit('edited', undefined);
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

    if (this.previewing) return; // в предпросмотре — только облёт
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
      if (e.pointerType === 'mouse' && !this.previewing) this.showCursor(this.raycastBody(e.clientX, e.clientY));
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
    this.lastStrokeTime = performance.now();
    navigator.vibrate?.(8); // короткий «тык» — палец почувствовал касание кисти
    this.emit('stroke', { state: 'start', speed: 0 });
    this.emit('change', undefined);
  }

  private continueStroke(hit: BodyHit | null) {
    const stroke = this.stroke;
    this.showCursor(hit);
    if (!stroke || !hit) return; // палец ушёл с тела — ждём, пока вернётся

    if (!partsLinked(hit.part, stroke.part)) {
      // Перешли на часть, не связанную суставом (с руки на торс сбоку), — между ними пустота, не интерполируем.
      // Через сустав (с бедра на голень) мазок идёт непрерывно: в позе покоя эти точки рядом.
      stroke.part = hit.part;
      stroke.last = hit.local.clone();
      stroke.carried = 0;
      this.paint([{ center: hit.local.clone(), normal: hit.localNormal.clone() }], hit.part);
      return;
    }
    const now = performance.now();
    stroke.part = hit.part;
    const moved = Math.hypot(hit.local.x - stroke.last.x, hit.local.y - stroke.last.y, hit.local.z - stroke.last.z);
    const elapsed = Math.max(1, now - this.lastStrokeTime) / 1000;
    this.lastStrokeTime = now;
    this.emit('stroke', { state: 'move', speed: moved / elapsed });

    const { points, carried } = interpolateStamps(stroke.last, hit.local, this.radius * STAMP_SPACING, stroke.carried);
    stroke.carried = carried;
    stroke.last = hit.local.clone();
    if (points.length) this.paint(points.map((center) => ({ center, normal: hit.localNormal.clone() })), hit.part);
  }

  private endStroke() {
    if (!this.stroke) return;
    this.stroke = null;
    this.emit('stroke', { state: 'end', speed: 0 });
    this.remember(this.colorHex);
    this.emit('change', undefined);
    this.emit('edited', undefined); // кожа изменилась — пора (с задержкой) отправить её другим
  }

  private paint(stamps: Stamp[], part: BodyZone) {
    const mode = this.tool === 'eyedropper' ? 'brush' : this.tool;
    // Спрей и губка кладут краску «частично» — им нужен мягкий край на весь радиус.
    const hardness = mode === 'spray' || mode === 'sponge' ? 0 : this.hardness;
    const brush = { radius: this.radius, hardness, opacity: this.opacity, color: this.color, mode };
    this.deps.painter.stamp(stamps, { ...brush, part });
    if (this.symmetry) {
      // Зеркало по X в позе покоя: персонаж симметричен, точка (x, y, z) левой руки — это (-x, y, z) правой.
      const mirrored = stamps.map((s) => ({
        center: { x: -s.center.x, y: s.center.y, z: s.center.z },
        normal: { x: -s.normal.x, y: s.normal.y, z: s.normal.z },
      }));
      this.deps.painter.stamp(mirrored, { ...brush, part: mirrorPart(part) });
    }
  }

  // ---------- Пипетка ----------

  /** Тап по себе — цвет своей кожи, тап по миру — цвет предмета. Потом снова кисть. */
  private pickColor(x: number, y: number) {
    const hit = this.raycastBody(x, y);
    const picked = hit ? this.deps.painter.readColor(hit.uv.x, hit.uv.y) : this.deps.eyedropper.pick(x, y);
    if (picked) {
      // Цвет предмета — это фон, под который маскируемся: запоминаем для сравнения в палитре.
      if (!hit) this.reference = picked;
      this.setColor(picked);
      this.remember(picked);
    }
    this.setTool(this.lastPaintTool);
  }

  private remember(hex: string) {
    this.recent = [hex, ...this.recent.filter((c) => c !== hex)].slice(0, RECENT_LIMIT);
  }

  // ---------- Луч в тело ----------

  private raycastBody(clientX: number, clientY: number): BodyHit | null {
    const rect = this.deps.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    const mesh = this.deps.model.mesh;
    const hit = this.raycaster.intersectObject(mesh, false)[0];
    if (!hit || !hit.face || !hit.uv || !hit.barycoord) return null;

    // Луч попал в треугольник позированного тела. Те же доли (барицентрические координаты)
    // от вершин в геометрии дают точку в позе покоя: вершины SkinnedMesh хранятся именно в ней.
    const { a, b, c } = hit.face;
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const w = hit.barycoord;
    const local = new THREE.Vector3()
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(position, a), w.x)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(position, b), w.y)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(position, c), w.z);
    const localNormal = new THREE.Vector3()
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(normal, a), w.x)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(normal, b), w.y)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(normal, c), w.z)
      .normalize();
    // face.normal посчитан по уже позированным вершинам (в системе сетки) — для кольца-курсора на экране.
    const worldNormal = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
    const bone = mesh.geometry.getAttribute('skinIndex').getX(a);
    return { part: PART_ORDER[bone], local, localNormal, world: hit.point.clone(), worldNormal, uv: hit.uv.clone() };
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private showCursor(hit: BodyHit | null) {
    if (!hit || this.tool === 'eyedropper' || this.previewing) {
      this.cursor.visible = false;
      return;
    }
    this.cursor.visible = true;
    this.cursor.position.copy(hit.world).addScaledVector(hit.worldNormal, 0.003);
    this.cursor.lookAt(hit.world.clone().add(hit.worldNormal));
    this.cursor.scale.setScalar(this.radius);
  }
}
