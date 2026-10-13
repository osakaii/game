import * as THREE from 'three';

const LIFETIME = 3; // секунды
const MAX_SPLATS = 24;

interface Splat {
  mesh: THREE.Mesh;
  age: number;
}

/**
 * Кляксы краски в местах, которые проверил ищущий. Видны всем:
 * прячущийся понимает, что ищущий рядом, — это добавляет напряжения.
 */
export class Splats {
  private readonly splats: Splat[] = [];
  // Одна геометрия на все кляксы, материал — свой у каждой (у каждой своя прозрачность при затухании).
  private readonly geometry = new THREE.SphereGeometry(0.18, 12, 8);

  constructor(private readonly scene: THREE.Scene) {}

  add(point: { x: number; y: number; z: number }, hit: boolean): void {
    const material = new THREE.MeshBasicMaterial({ color: hit ? '#ffd166' : '#d62828', transparent: true });
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.position.set(point.x, point.y, point.z);
    this.scene.add(mesh);
    this.splats.push({ mesh, age: 0 });

    if (this.splats.length > MAX_SPLATS) this.remove(this.splats.shift()!);
  }

  update(dt: number): void {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const splat = this.splats[i];
      splat.age += dt;
      const life = splat.age / LIFETIME;
      if (life >= 1) {
        this.remove(splat);
        this.splats.splice(i, 1);
        continue;
      }
      // Быстро «плюхается» и медленно тает.
      splat.mesh.scale.setScalar(Math.min(1, splat.age * 8) * (1 + life * 0.5));
      (splat.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - life;
    }
  }

  private remove(splat: Splat) {
    this.scene.remove(splat.mesh);
    // Материал удаляем явно: three.js не освобождает видеопамять сам.
    (splat.mesh.material as THREE.Material).dispose();
  }
}
