import * as THREE from 'three';

/**
 * Минимальная сцена: проверяем, что three.js работает на телефоне.
 * На этапе 1 заменим на карту, персонажа и камеру от третьего лица.
 */
export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // На телефонах devicePixelRatio бывает 3 — рендерить в 3x слишком дорого.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1f2a');

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 1.5, 4);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5);
  sun.position.set(3, 5, 2);
  scene.add(sun);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#ff6b9a' }),
  );
  scene.add(cube);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    // dt — время кадра в секундах. Движение через dt не зависит от FPS устройства.
    const dt = clock.getDelta();
    cube.rotation.x += dt * 0.6;
    cube.rotation.y += dt * 0.9;
    renderer.render(scene, camera);
  });
}
