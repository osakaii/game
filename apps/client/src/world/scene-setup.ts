import * as THREE from 'three';
import { graphics } from '../platform/graphics';

/** Вертикальный FOV в альбомной ориентации, в градусах. */
const BASE_FOV = 65;
const MAX_PORTRAIT_FOV = 90;

/**
 * three.js задаёт FOV по вертикали. В портрете экран узкий, и по горизонтали
 * видно совсем мало. Поэтому в портрете держим горизонтальный угол = BASE_FOV.
 */
function fovForAspect(aspect: number): number {
  if (aspect >= 1) return BASE_FOV;
  const halfHorizontal = THREE.MathUtils.degToRad(BASE_FOV / 2);
  const vertical = 2 * Math.atan(Math.tan(halfHorizontal) / aspect);
  return Math.min(THREE.MathUtils.radToDeg(vertical), MAX_PORTRAIT_FOV);
}

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
}

export function createSceneContext(canvas: HTMLCanvasElement): SceneContext {
  const dpr = Math.min(window.devicePixelRatio, 2);
  // На экранах с dpr 2 сглаживание почти незаметно, а стоит дорого — выключаем.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: dpr < 2,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(dpr);
  // Тени: сцена рисуется ещё раз «глазами солнца» в текстуру глубины (shadow map).
  // PCF — сглаживание краёв тени, дешевле PCFSoft. Включение — по настройке игрока.
  //
  // Тени «запечены»: карта и солнце неподвижны, поэтому карта теней считается один раз при загрузке
  // карты (refreshShadows), а не каждый кадр. Это убирает второй рендер всей карты из каждого кадра —
  // для телефона самая большая экономия. Персонажи тени не отбрасывают (под ними — круглая тень),
  // но получают её: под столом персонаж темнеет вместе со всем вокруг.
  renderer.shadowMap.enabled = graphics.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  // Цвет неба задаёт карта (ActiveMap.load).

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 120);

  // Тёплый рассеянный свет сверху и чуть более холодный снизу: уютно, как днём в квартире.
  scene.add(new THREE.HemisphereLight('#fff6ea', '#8a7a66', 1.45));
  const sun = new THREE.DirectionalLight('#fff1dc', 1.55);
  sun.position.set(8, 14, 6);
  sun.castShadow = graphics.shadows;
  // Карта теней считается раз за карту — можно позволить 2048²: тени чёткие и на 30-метровой карте.
  sun.shadow.mapSize.set(2048, 2048);
  // bias/normalBias убирают «полосатость» (shadow acne) — поверхность не затеняет саму себя.
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    // Скрытая вкладка или свёрнутое окно дают 0×0: 0/0 = NaN испортил бы камеру до следующего resize.
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fovForAspect(camera.aspect);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, sun };
}

/** Рендер в меньшем разрешении (1× вместо 2×) — вчетверо меньше пикселей на кадр. */
export function setRenderScale(context: SceneContext, pixelRatio: number): void {
  context.renderer.setPixelRatio(pixelRatio);
  const canvas = context.renderer.domElement;
  context.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
}

/**
 * Включить/выключить тени на лету. Шейдеры материалов с тенями и без — разные,
 * поэтому всем материалам ставим needsUpdate: three.js пересоберёт их на следующем кадре.
 */
export function applyShadows(context: SceneContext, enabled: boolean): void {
  const { renderer, scene, sun } = context;
  renderer.shadowMap.enabled = enabled;
  sun.castShadow = enabled;
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) (object.material as THREE.Material).needsUpdate = true;
  });
  refreshShadows(context);
}

/** Пересчитать запечённые тени на следующем кадре: карта сменилась или тени включили. */
export function refreshShadows({ renderer }: Pick<SceneContext, 'renderer'>): void {
  renderer.shadowMap.needsUpdate = true;
}
