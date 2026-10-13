import * as THREE from 'three';

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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ad1ff');

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 120);

  // Без теней в реальном времени: на мобилке это самая дорогая часть рендера.
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a66', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(6, 10, 4);
  scene.add(sun);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fovForAspect(camera.aspect);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera };
}
