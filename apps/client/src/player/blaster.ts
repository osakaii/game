import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Цвет краски ищущих: яркий, на любом фоне видно, куда стреляли. Им же окрашены кляксы. */
export const SEEKER_PAINT = '#ff3d7f';

/**
 * Геометрии и материалы общие для всех краскомётов: у каждого ищущего своя только группа и уровень краски.
 * Ось оружия: +Z — куда стреляет, +Y — верх. Начало координат — рукоять (её держит кисть).
 */
const shared = (() => {
  const body = new RoundedBoxGeometry(0.11, 0.12, 0.3, 3, 0.04);
  body.translate(0, 0.07, 0.08);
  const grip = new RoundedBoxGeometry(0.06, 0.13, 0.07, 2, 0.025);
  grip.rotateX(-0.25);
  const nozzle = new THREE.CylinderGeometry(0.022, 0.03, 0.12, 14);
  nozzle.rotateX(Math.PI / 2);
  nozzle.translate(0, 0.08, 0.28);
  const ring = new THREE.TorusGeometry(0.032, 0.01, 8, 18);
  ring.translate(0, 0.08, 0.335);
  // Бак сверху: прозрачная колба, в ней краска. Уровень краски = готовность к выстрелу.
  const tank = new THREE.CylinderGeometry(0.045, 0.045, 0.13, 16);
  tank.rotateX(Math.PI / 2);
  tank.translate(0, 0.165, 0.06);
  const paint = new THREE.CylinderGeometry(0.038, 0.038, 0.12, 16);
  paint.rotateX(Math.PI / 2);
  // Краска «налита» снизу: масштаб по Y меняет уровень, низ остаётся на месте.
  paint.translate(0, 0.038, 0);
  return {
    body,
    grip,
    nozzle,
    ring,
    tank,
    paint,
    bodyMaterial: new THREE.MeshLambertMaterial({ color: '#ffb703' }),
    darkMaterial: new THREE.MeshLambertMaterial({ color: '#2b2d42' }),
    glassMaterial: new THREE.MeshLambertMaterial({ color: '#dff6ff', transparent: true, opacity: 0.35, depthWrite: false }),
    paintMaterial: new THREE.MeshBasicMaterial({ color: SEEKER_PAINT }),
  };
})();

/**
 * Краскомёт ищущего — игрушечный пневмопистолет с баком краски.
 * Видят его все: прячущийся издалека понимает, что это ищущий и куда он целится.
 */
export class Blaster {
  readonly root = new THREE.Group();
  /** Точка вылета краски (кончик сопла) — отсюда летят выстрелы и вспышка. */
  readonly muzzle = new THREE.Object3D();
  private readonly paint: THREE.Mesh;
  private level = 1;

  constructor() {
    const { body, grip, nozzle, ring, tank, paint } = shared;
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => new THREE.Mesh(geometry, material);
    this.paint = mesh(paint, shared.paintMaterial);
    this.paint.position.set(0, 0.127, 0.06);
    this.root.add(
      mesh(body, shared.bodyMaterial),
      mesh(grip, shared.darkMaterial),
      mesh(nozzle, shared.darkMaterial),
      mesh(ring, shared.paintMaterial),
      this.paint,
      mesh(tank, shared.glassMaterial),
    );
    this.muzzle.position.set(0, 0.08, 0.35);
    this.root.add(this.muzzle);
    this.root.name = 'blaster';
  }

  /** Уровень краски в баке 0..1: после выстрела пустеет и наполняется к концу перезарядки. */
  setPaintLevel(level: number): void {
    const clamped = Math.min(1, Math.max(0.02, level));
    if (Math.abs(clamped - this.level) < 0.005) return;
    this.level = clamped;
    this.paint.scale.y = clamped;
  }
}
