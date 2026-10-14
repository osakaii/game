import * as THREE from 'three';
import { getSkinAtlas } from '../skin/atlas';
import { buildPositionMap } from '../skin/position-map';
import type { Point3 } from './brush-stamps';
import {
  BAKE_FRAGMENT,
  BRUSH_WET_FRAGMENT,
  CLEAR_FRAGMENT,
  COMPOSITE_FRAGMENT,
  COPY_FRAGMENT,
  DRY_TRANSFER_FRAGMENT,
  DRY_WET_FRAGMENT,
  FLOW_FRAGMENT,
  MAX_STAMPS,
  QUAD_VERTEX,
} from './wet-shaders';

export const MAX_STAMPS_PER_PASS = MAX_STAMPS;
const UNDO_LIMIT = 15;
/** Симуляция течения идёт фиксированными шагами — одинаково при любом FPS. */
const SIM_STEP = 1 / 30;
/** Не больше шагов за кадр: после подвисания не пытаемся догнать секунды симуляции разом. */
const MAX_STEPS_PER_FRAME = 4;
/** Проходов течения за шаг: каждый двигает краску не дальше чем на тексель — нужно несколько. */
const FLOW_ITERATIONS = 2;

export interface Stamp {
  center: Point3;
  normal: Point3;
}

/** Режим кисти — номер совпадает с uMode в шейдере. */
export const BRUSH_MODES = { brush: 0, spray: 1, sponge: 2, eraser: 3 } as const;
export type BrushMode = keyof typeof BRUSH_MODES;

export interface BrushParams {
  part: number;
  radius: number;
  hardness: number;
  opacity: number;
  color: THREE.Color;
  mode?: BrushMode;
}

/**
 * Кожа своего персонажа на видеокарте, с мокрой краской.
 *
 *   wet  — мокрый слой (две текстуры по очереди, «ping-pong»: из одной читаем, в другую пишем —
 *          шейдер не может читать и писать одну и ту же текстуру одновременно);
 *   dry  — сухой слой;
 *   view — показ: сухой + мокрый поверх. Именно он натянут на модель, из него снимки и экспорт.
 */
export class SkinPainter {
  private readonly size: number;
  private readonly dry: THREE.WebGLRenderTarget;
  private readonly view: THREE.WebGLRenderTarget;
  private wetRead: THREE.WebGLRenderTarget;
  private wetWrite: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly materials: Record<string, THREE.ShaderMaterial>;
  private readonly dataTextures: THREE.Texture[];
  private readonly undoStack: THREE.WebGLRenderTarget[] = [];
  private readonly redoStack: THREE.WebGLRenderTarget[] = [];
  private readonly pixel = new Uint8Array(4);
  private simAccumulator = 0;
  /** До какого момента (performance.now) на коже может оставаться мокрая краска. */
  private wetUntil = 0;
  private wetness = 0.6;
  /** Тип мокрого слоя: half-float, если видеокарта умеет в него рисовать, иначе 8 бит с подмешиванием шума. */
  readonly precision: 'half-float' | '8-bit';

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const atlas = getSkinAtlas();
    this.size = atlas.size;
    this.dry = createColorTarget(this.size, false);
    this.view = createColorTarget(this.size, true);

    const extensions = renderer.extensions;
    const canRenderHalfFloat =
      extensions.has('EXT_color_buffer_float') || extensions.has('EXT_color_buffer_half_float');
    this.precision = canRenderHalfFloat ? 'half-float' : '8-bit';
    const wetType = canRenderHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.wetRead = createDataTarget(this.size, wetType);
    this.wetWrite = createDataTarget(this.size, wetType);

    const map = buildPositionMap(atlas);
    const positions = dataTexture(map.data, this.size, THREE.FloatType);
    const normals = dataTexture(map.normals, this.size, THREE.UnsignedByteType);
    const noise = smoothNoiseTexture();
    this.dataTextures = [positions, normals, noise];

    const shader = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: QUAD_VERTEX,
        fragmentShader,
        blending,
        transparent: blending !== THREE.NoBlending,
        depthTest: false,
        depthWrite: false,
      });
    const texel = new THREE.Vector2(1 / this.size, 1 / this.size);
    this.materials = {
      brush: shader(
        BRUSH_WET_FRAGMENT,
        {
          uWet: { value: null },
          uPositions: { value: positions },
          uNormals: { value: normals },
          uCount: { value: 0 },
          uCenters: { value: Array.from({ length: MAX_STAMPS }, () => new THREE.Vector3()) },
          uStampNormals: { value: Array.from({ length: MAX_STAMPS }, () => new THREE.Vector3()) },
          uPart: { value: 0 },
          uRadius: { value: 0.05 },
          uHardness: { value: 0.5 },
          uOpacity: { value: 1 },
          uColor: { value: new THREE.Color() },
          uMode: { value: 0 },
          uSeed: { value: 0 },
          uNoise: { value: noise },
          uBaseColors: { value: Array.from({ length: 6 }, () => new THREE.Color('#f2f2f2')) },
        },
        THREE.NoBlending,
      ),
      flow: shader(
        FLOW_FRAGMENT,
        {
          uWet: { value: null },
          uPositions: { value: positions },
          uNormals: { value: normals },
          uNoise: { value: noise },
          uTexel: { value: texel },
          uDiffusion: { value: 0 },
          uDrip: { value: 0 },
          uDripThreshold: { value: 0.6 },
          uDither: { value: this.precision === '8-bit' ? 1 / 255 : 0 },
        },
        THREE.NoBlending,
      ),
      dryTransfer: shader(DRY_TRANSFER_FRAGMENT, { uWet: { value: null }, uDryAmount: { value: 0 } }, THREE.NormalBlending),
      dryWet: shader(DRY_WET_FRAGMENT, { uWet: { value: null }, uDryAmount: { value: 0 } }, THREE.NoBlending),
      composite: shader(COMPOSITE_FRAGMENT, { uDry: { value: this.dry.texture }, uWet: { value: null } }, THREE.NoBlending),
      bake: shader(BAKE_FRAGMENT, { uWet: { value: null } }, THREE.NormalBlending),
      copy: shader(COPY_FRAGMENT, { uSource: { value: null } }, THREE.NoBlending),
      clear: shader(CLEAR_FRAGMENT, {}, THREE.NoBlending),
    };

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.materials.copy);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.clearWet();
  }

  /** Текстура для модели. */
  get texture(): THREE.Texture {
    return this.view.texture;
  }

  /** Цвета основы по частям тела (порядок PART_ORDER) — их кладёт ластик. */
  setBaseColors(colors: readonly string[]): void {
    const target = this.materials.brush.uniforms.uBaseColors.value as THREE.Color[];
    colors.forEach((hex, i) => target[i]?.set(hex));
  }

  /** 0 — краска сохнет мгновенно, 1 — долго течёт и даёт подтёки. */
  setWetness(value: number): void {
    this.wetness = Math.min(1, Math.max(0, value));
  }

  /** Время высыхания при текущей влажности (с). */
  private get dryTime(): number {
    return 0.15 + 3.35 * this.wetness;
  }

  get isWet(): boolean {
    return performance.now() < this.wetUntil;
  }

  /** Сколько ещё сохнуть (мс). */
  get msUntilDry(): number {
    return Math.max(0, this.wetUntil - performance.now());
  }

  /** Залить кожу содержимым другой текстуры (основа или картинка из сети). Мокрое и история — сбрасываются. */
  resetFrom(source: THREE.Texture): void {
    this.blit('copy', { uSource: source }, this.dry, true);
    this.clearWet();
    this.clearHistory(this.undoStack);
    this.clearHistory(this.redoStack);
    this.composite();
  }

  /** Перед мазком запоминаем то, что видно сейчас, — «Отменить» вернёт именно это. */
  beginStroke(): void {
    const snapshot = this.undoStack.length >= UNDO_LIMIT ? this.undoStack.shift()! : createColorTarget(this.size, false);
    this.blit('copy', { uSource: this.view.texture }, snapshot, true);
    this.undoStack.push(snapshot);
    this.clearHistory(this.redoStack);
  }

  stamp(stamps: readonly Stamp[], brush: BrushParams): void {
    const u = this.materials.brush.uniforms;
    u.uPart.value = brush.part;
    u.uRadius.value = brush.radius;
    u.uHardness.value = brush.hardness;
    u.uOpacity.value = brush.opacity;
    (u.uColor.value as THREE.Color).copy(brush.color);
    u.uMode.value = BRUSH_MODES[brush.mode ?? 'brush'];
    for (let start = 0; start < stamps.length; start += MAX_STAMPS) {
      const batch = stamps.slice(start, start + MAX_STAMPS);
      batch.forEach((s, i) => {
        (u.uCenters.value[i] as THREE.Vector3).set(s.center.x, s.center.y, s.center.z);
        (u.uStampNormals.value[i] as THREE.Vector3).set(s.normal.x, s.normal.y, s.normal.z);
      });
      u.uCount.value = batch.length;
      u.uSeed.value = Math.random() * 1000;
      u.uWet.value = this.wetRead.texture;
      this.renderPass('brush', this.wetWrite, true);
      this.swapWet();
    }
    // Свежая краска высохнет не раньше, чем через dryTime (+ запас на растекание).
    this.wetUntil = Math.max(this.wetUntil, performance.now() + this.dryTime * 1000 + 300);
    this.composite();
  }

  /** Каждый кадр. Симуляция идёт только пока есть мокрая краска — сухая кожа видеокарту не нагружает. */
  update(dt: number): void {
    if (!this.isWet) return;
    this.simAccumulator = Math.min(this.simAccumulator + dt, SIM_STEP * MAX_STEPS_PER_FRAME);
    let stepped = false;
    while (this.simAccumulator >= SIM_STEP) {
      this.simAccumulator -= SIM_STEP;
      this.simulateStep();
      stepped = true;
    }
    if (stepped) this.composite();
  }

  /** Досушить мгновенно — перед отправкой по сети, когда ждать некогда (конец пряток). */
  dryNow(): void {
    this.blit('bake', { uWet: this.wetRead.texture }, this.dry, false);
    this.clearWet();
    this.wetUntil = 0;
    this.composite();
  }

  /** Отменить начатый мазок целиком, без возможности «Повторить» (это был не мазок, а жест). */
  cancelStroke(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    this.restore(snapshot);
    snapshot.dispose();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    this.swapWith(this.undoStack, this.redoStack);
  }

  redo(): void {
    this.swapWith(this.redoStack, this.undoStack);
  }

  /** Цвет кожи в точке UV (как видно сейчас) — для пипетки по своему телу. */
  readColor(u: number, v: number): string {
    const x = Math.min(this.size - 1, Math.max(0, Math.floor(u * this.size)));
    const y = Math.min(this.size - 1, Math.max(0, Math.floor(v * this.size)));
    this.renderer.readRenderTargetPixels(this.view, x, y, 1, 1, this.pixel);
    return `#${[this.pixel[0], this.pixel[1], this.pixel[2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }

  /**
   * Кожа целиком как сжатая картинка — для отправки по сети.
   * Пиксели читаем с видеокарты (уже в sRGB), переворачиваем по вертикали
   * (в WebGL строка 0 — низ, в картинке — верх) и сжимаем браузерным кодеком.
   */
  async exportImage(): Promise<Blob> {
    const pixels = new Uint8ClampedArray(this.size * this.size * 4);
    this.renderer.readRenderTargetPixels(this.view, 0, 0, this.size, this.size, pixels);
    const flipped = new Uint8ClampedArray(pixels.length);
    const row = this.size * 4;
    for (let y = 0; y < this.size; y++) {
      flipped.set(pixels.subarray(y * row, (y + 1) * row), (this.size - 1 - y) * row);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.size;
    canvas.getContext('2d')!.putImageData(new ImageData(flipped, this.size, this.size), 0, 0);
    // WebP с потерями, но высоким качеством: ~50–120 КБ вместо ~1 МБ сырых пикселей.
    // Safari до недавних версий не умеет кодировать WebP и молча отдаёт PNG — сервер примет и его.
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/webp', 0.92),
    );
  }

  dispose(): void {
    for (const t of [this.dry, this.view, this.wetRead, this.wetWrite]) t.dispose();
    this.clearHistory(this.undoStack);
    this.clearHistory(this.redoStack);
    for (const t of this.dataTextures) t.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.quad.geometry.dispose();
  }

  // ---------- Симуляция ----------

  private simulateStep() {
    // Чем мокрее кисть, тем сильнее растекание и подтёки. Значения подобраны на глаз.
    // Устойчивость: за один проход тексель может отдать соседям не больше, чем у него есть:
    // 4 соседа × 0.14 × максимум шума 1.65 ≈ 0.92 < 1. Больше — и симуляция «взорвётся» (краска из ниоткуда).
    const flow = this.materials.flow.uniforms;
    flow.uDiffusion.value = 0.14 * this.wetness;
    flow.uDrip.value = 0.5 * this.wetness;
    for (let i = 0; i < FLOW_ITERATIONS; i++) {
      flow.uWet.value = this.wetRead.texture;
      this.renderPass('flow', this.wetWrite, true);
      this.swapWet();
    }

    const dryAmount = SIM_STEP / this.dryTime;
    this.blit('dryTransfer', { uWet: this.wetRead.texture, uDryAmount: dryAmount }, this.dry, false);
    this.materials.dryWet.uniforms.uDryAmount.value = dryAmount;
    this.materials.dryWet.uniforms.uWet.value = this.wetRead.texture;
    this.renderPass('dryWet', this.wetWrite, true);
    this.swapWet();
  }

  private composite() {
    this.materials.composite.uniforms.uWet.value = this.wetRead.texture;
    this.renderPass('composite', this.view, true);
  }

  private clearWet() {
    this.renderPass('clear', this.wetRead, true);
    this.renderPass('clear', this.wetWrite, true);
  }

  private swapWet() {
    [this.wetRead, this.wetWrite] = [this.wetWrite, this.wetRead];
  }

  /** Снимок (как было видно) становится сухим слоем; мокрого нет. */
  private restore(snapshot: THREE.WebGLRenderTarget) {
    this.blit('copy', { uSource: snapshot.texture }, this.dry, true);
    this.clearWet();
    this.wetUntil = 0;
    this.composite();
  }

  /** Обмен «текущее <-> снимок из истории»: текущее (как видно) уходит в другую историю. */
  private swapWith(from: THREE.WebGLRenderTarget[], to: THREE.WebGLRenderTarget[]) {
    const snapshot = from.pop();
    if (!snapshot) return;
    const current = createColorTarget(this.size, false);
    this.blit('copy', { uSource: this.view.texture }, current, true);
    to.push(current);
    this.restore(snapshot);
    snapshot.dispose();
  }

  private blit(material: string, uniforms: Record<string, unknown>, destination: THREE.WebGLRenderTarget, clear: boolean) {
    const m = this.materials[material];
    for (const [name, value] of Object.entries(uniforms)) m.uniforms[name].value = value;
    this.renderPass(material, destination, clear);
  }

  private renderPass(material: string, destination: THREE.WebGLRenderTarget, clear: boolean) {
    this.quad.material = this.materials[material];
    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = clear;
    this.renderer.setRenderTarget(destination);
    this.renderer.render(this.quadScene, this.quadCamera);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.autoClear = previousAutoClear;
  }

  private clearHistory(stack: THREE.WebGLRenderTarget[]) {
    for (const target of stack) target.dispose();
    stack.length = 0;
  }
}

/** Цветная текстура кожи: хранит sRGB (точнее для тёмных оттенков в 8 битах). */
function createColorTarget(size: number, mipmaps: boolean): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, {
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: false,
    generateMipmaps: mipmaps,
    minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  target.texture.anisotropy = 4;
  return target;
}

/** Текстура-данные (мокрый слой): без цветового пространства, ближайший тексель, без мипмапов. */
function createDataTarget(size: number, type: THREE.TextureDataType): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(size, size, {
    type,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
}

function dataTexture(data: Float32Array | Uint8Array, size: number, type: THREE.TextureDataType): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, type);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Плавный шум для неровного течения: случайные значения на крупной сетке 64×64 (клетка ≈ 4 см на теле),
 * между ними видеокарта плавно интерполирует (LinearFilter). Шум «на каждый тексель» давал бы зерно,
 * как через сито; плавный — органично рваный край кляксы. Шум неизменный — края не «кипят».
 */
function smoothNoiseTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
