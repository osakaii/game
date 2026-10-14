import * as THREE from 'three';
import { buildPositionMap } from '../skin/position-map';
import { getSkinAtlas } from '../skin/atlas';
import type { Point3 } from './brush-stamps';

/** Сколько оттисков обрабатывает один проход шейдера (ограничение на массивы uniform). */
export const MAX_STAMPS_PER_PASS = 16;
const UNDO_LIMIT = 15;

export interface Stamp {
  /** Центр оттиска в системе координат своей части тела. */
  center: Point3;
  /** Нормаль поверхности под пальцем — красим только грани, смотрящие в ту же сторону. */
  normal: Point3;
}

export interface BrushParams {
  /** Номер части тела + 1 (как в карте позиций). */
  part: number;
  radius: number;
  /** 0 — мягкий край на весь радиус, 1 — жёсткий край. */
  hardness: number;
  opacity: number;
  color: THREE.Color;
}

/**
 * Кисть на видеокарте. Кожа хранится в render target — текстуре, в которую рисует сама видеокарта.
 *
 * Оттиск кисти — это проход по ВСЕМ текселям кожи (полноэкранный квадрат в пространстве UV).
 * Для каждого текселя шейдер смотрит в карту позиций: «где я на теле?» — и если эта точка
 * ближе радиуса к центру оттиска, тексель закрашивается. Поэтому мазок идёт через рёбра без швов.
 */
export class SkinPainter {
  readonly target: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly brushMaterial: THREE.ShaderMaterial;
  private readonly copyMaterial: THREE.ShaderMaterial;
  private readonly positions: THREE.DataTexture;
  private readonly normals: THREE.DataTexture;
  private readonly undoStack: THREE.WebGLRenderTarget[] = [];
  private readonly redoStack: THREE.WebGLRenderTarget[] = [];
  private readonly pixel = new Uint8Array(4);

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const atlas = getSkinAtlas();
    this.target = createSkinTarget(atlas.size);

    const map = buildPositionMap(atlas);
    // Float-текстуры видеокарта не умеет сглаживать на всех устройствах — берём ближайший тексель.
    this.positions = new THREE.DataTexture(map.data, map.size, map.size, THREE.RGBAFormat, THREE.FloatType);
    this.positions.magFilter = this.positions.minFilter = THREE.NearestFilter;
    this.positions.needsUpdate = true;
    this.normals = new THREE.DataTexture(map.normals, map.size, map.size, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.normals.magFilter = this.normals.minFilter = THREE.NearestFilter;
    this.normals.needsUpdate = true;

    this.brushMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: this.positions },
        uNormals: { value: this.normals },
        uCount: { value: 0 },
        uCenters: { value: Array.from({ length: MAX_STAMPS_PER_PASS }, () => new THREE.Vector3()) },
        uStampNormals: { value: Array.from({ length: MAX_STAMPS_PER_PASS }, () => new THREE.Vector3()) },
        uPart: { value: 0 },
        uRadius: { value: 0.05 },
        uHardness: { value: 0.5 },
        uOpacity: { value: 1 },
        uColor: { value: new THREE.Color() },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: BRUSH_FRAGMENT,
      // Обычное смешивание: новый цвет * alpha + старый * (1 - alpha). Старый цвет — то, что уже на коже.
      blending: THREE.NormalBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { uSource: { value: null } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.brushMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  /** Залить кожу содержимым другой текстуры (например, базовой раскраской). История очищается. */
  resetFrom(source: THREE.Texture): void {
    this.copy(source, this.target);
    this.clearHistory(this.undoStack);
    this.clearHistory(this.redoStack);
  }

  /** Перед мазком запоминаем кожу целиком — так работает «Отменить». */
  beginStroke(): void {
    const snapshot = this.undoStack.length >= UNDO_LIMIT ? this.undoStack.shift()! : createSkinTarget(this.target.width);
    this.copy(this.target.texture, snapshot);
    this.undoStack.push(snapshot);
    this.clearHistory(this.redoStack); // новый мазок отменяет возможность «Повторить»
  }

  stamp(stamps: readonly Stamp[], brush: BrushParams): void {
    const u = this.brushMaterial.uniforms;
    u.uPart.value = brush.part;
    u.uRadius.value = brush.radius;
    u.uHardness.value = brush.hardness;
    u.uOpacity.value = brush.opacity;
    (u.uColor.value as THREE.Color).copy(brush.color);

    for (let start = 0; start < stamps.length; start += MAX_STAMPS_PER_PASS) {
      const batch = stamps.slice(start, start + MAX_STAMPS_PER_PASS);
      batch.forEach((s, i) => {
        (u.uCenters.value[i] as THREE.Vector3).set(s.center.x, s.center.y, s.center.z);
        (u.uStampNormals.value[i] as THREE.Vector3).set(s.normal.x, s.normal.y, s.normal.z);
      });
      u.uCount.value = batch.length;
      this.quad.material = this.brushMaterial;
      this.renderInto(this.target, false);
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Отменить начатый мазок целиком, без возможности «Повторить» (это был не мазок, а жест). */
  cancelStroke(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    this.copy(snapshot.texture, this.target);
    snapshot.dispose();
  }

  undo(): void {
    this.swapWith(this.undoStack, this.redoStack);
  }

  redo(): void {
    this.swapWith(this.redoStack, this.undoStack);
  }

  /** Цвет кожи в точке UV — для пипетки по своему телу. */
  readColor(u: number, v: number): string {
    const size = this.target.width;
    const x = Math.min(size - 1, Math.max(0, Math.floor(u * size)));
    const y = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
    this.renderer.readRenderTargetPixels(this.target, x, y, 1, 1, this.pixel);
    // Render target хранит цвет в sRGB (SRGB8_ALPHA8) — байты уже готовые '#rrggbb'.
    return `#${[this.pixel[0], this.pixel[1], this.pixel[2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }

  /**
   * Кожа целиком как сжатая картинка — для отправки по сети.
   * Пиксели читаем с видеокарты (уже в sRGB), переворачиваем по вертикали
   * (в WebGL строка 0 — низ, в картинке — верх) и сжимаем браузерным кодеком.
   */
  async exportImage(): Promise<Blob> {
    const size = this.target.width;
    const pixels = new Uint8ClampedArray(size * size * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, size, size, pixels);

    const flipped = new Uint8ClampedArray(pixels.length);
    const row = size * 4;
    for (let y = 0; y < size; y++) flipped.set(pixels.subarray(y * row, (y + 1) * row), (size - 1 - y) * row);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d')!.putImageData(new ImageData(flipped, size, size), 0, 0);
    // WebP с потерями, но высоким качеством: ~50–120 КБ вместо ~1 МБ сырых пикселей.
    // Safari до недавних версий не умеет кодировать WebP и молча отдаёт PNG — сервер примет и его.
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/webp', 0.92),
    );
  }

  dispose(): void {
    this.target.dispose();
    this.clearHistory(this.undoStack);
    this.clearHistory(this.redoStack);
    this.positions.dispose();
    this.normals.dispose();
    this.brushMaterial.dispose();
    this.copyMaterial.dispose();
    this.quad.geometry.dispose();
  }

  /** Обмен «текущая кожа <-> снимок из истории» без лишних копий: меняем местами буферы. */
  private swapWith(from: THREE.WebGLRenderTarget[], to: THREE.WebGLRenderTarget[]) {
    const snapshot = from.pop();
    if (!snapshot) return;
    const current = createSkinTarget(this.target.width);
    this.copy(this.target.texture, current);
    to.push(current);
    this.copy(snapshot.texture, this.target);
    snapshot.dispose();
  }

  private copy(source: THREE.Texture, destination: THREE.WebGLRenderTarget) {
    this.copyMaterial.uniforms.uSource.value = source;
    this.quad.material = this.copyMaterial;
    this.renderInto(destination, true);
  }

  private renderInto(destination: THREE.WebGLRenderTarget, clear: boolean) {
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

/**
 * Текстура-кожа в видеопамяти. colorSpace sRGB — видеокарта сама переводит цвет:
 * шейдер пишет «линейный» цвет, в памяти хранится sRGB (точнее для тёмных оттенков в 8 битах),
 * при чтении в шейдере модели — обратно в линейный.
 */
function createSkinTarget(size: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, {
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  target.texture.anisotropy = 4;
  return target;
}

/** Квадрат на весь «экран» текстуры: вершины уже в координатах отсечения, камера не нужна. */
const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRUSH_FRAGMENT = /* glsl */ `
  #define MAX_STAMPS ${MAX_STAMPS_PER_PASS}
  uniform sampler2D uPositions; // rgb — точка на теле, a — номер части + 1
  uniform sampler2D uNormals;   // нормаль грани, упакованная в 0..1
  uniform int uCount;
  uniform vec3 uCenters[MAX_STAMPS];
  uniform vec3 uStampNormals[MAX_STAMPS];
  uniform float uPart;
  uniform float uRadius;
  uniform float uHardness;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    vec4 body = texture2D(uPositions, vUv);
    // Другая часть тела или пустое место атласа — не трогаем.
    if (abs(body.a - uPart) > 0.5) discard;
    vec3 normal = texture2D(uNormals, vUv).rgb * 2.0 - 1.0;

    float coverage = 0.0;
    for (int i = 0; i < MAX_STAMPS; i++) {
      if (i >= uCount) break;
      float d = distance(body.rgb, uCenters[i]) / uRadius;
      // Мягкий край: внутри hardness — полный цвет, к краю радиуса плавно сходит на нет.
      float falloff = 1.0 - smoothstep(uHardness, 1.0, d);
      // Соседние грани (под 90°) красим, противоположные (180°) — нет.
      float facing = smoothstep(-0.6, -0.2, dot(normal, uStampNormals[i]));
      coverage = max(coverage, falloff * facing);
    }
    if (coverage <= 0.0) discard;
    gl_FragColor = vec4(uColor, coverage * uOpacity);
  }
`;

const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D uSource;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uSource, vUv).rgb, 1.0);
  }
`;
