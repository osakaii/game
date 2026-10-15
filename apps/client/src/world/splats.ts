import * as THREE from 'three';
import { surfaceNormalAt } from '@mecha/shared';
import { SEEKER_PAINT } from '../player/blaster';
import type { WorldGeometry } from './active-map';

const DECAL_LIFETIME = 8; // с — пятно на поверхности
const DECAL_FADE = 2; // последние секунды пятно тает
const BURST_LIFETIME = 1; // с — вспышка при попадании в игрока
const MAX_SPLATS = 40;
const DECAL_SIZE = 0.8;

interface Splat {
  mesh: THREE.Mesh;
  age: number;
  lifetime: number;
  burst: boolean;
}

/**
 * Следы проверок ищущего. Промах — пятно краски на стене/полу (decal), попадание — жёлтая вспышка.
 * Видны всем: прячущийся понимает, что ищущий рядом и где он уже искал.
 */
export class Splats {
  private readonly splats: Splat[] = [];
  // Геометрии и текстура общие для всех пятен; материал у каждого свой — у каждого своя прозрачность.
  private readonly decalGeometry = new THREE.PlaneGeometry(DECAL_SIZE, DECAL_SIZE);
  private readonly burstGeometry = new THREE.SphereGeometry(0.2, 12, 8);
  private readonly texture = createSplatTexture();
  private readonly target = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: WorldGeometry,
  ) {}

  add(point: { x: number; y: number; z: number }, hit: boolean): void {
    const mesh = hit ? this.createBurst() : this.createDecal(point);
    if (hit) mesh.position.set(point.x, point.y, point.z);
    this.scene.add(mesh);
    this.splats.push({ mesh, age: 0, lifetime: hit ? BURST_LIFETIME : DECAL_LIFETIME, burst: hit });
    if (this.splats.length > MAX_SPLATS) this.remove(this.splats.shift()!);
  }

  update(dt: number): void {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const splat = this.splats[i];
      splat.age += dt;
      if (splat.age >= splat.lifetime) {
        this.remove(splat);
        this.splats.splice(i, 1);
        continue;
      }
      const material = splat.mesh.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
      if (splat.burst) {
        const life = splat.age / splat.lifetime;
        splat.mesh.scale.setScalar(0.5 + life * 2);
        material.opacity = 1 - life;
      } else {
        // Пятно «плюхается» за 0.1 с, держится и тает в конце.
        splat.mesh.scale.setScalar(Math.min(1, splat.age * 10));
        material.opacity = Math.min(1, (splat.lifetime - splat.age) / DECAL_FADE);
      }
    }
  }

  /** При смене карты старые пятна висели бы в воздухе. */
  clear(): void {
    for (const splat of this.splats) this.remove(splat);
    this.splats.length = 0;
  }

  private createDecal(point: { x: number; y: number; z: number }): THREE.Mesh {
    const normal = surfaceNormalAt(point, this.world.colliders);
    const material = new THREE.MeshLambertMaterial({
      color: SEEKER_PAINT, // цвет краски ищущих — как в баке краскомёта
      map: this.texture,
      transparent: true,
      depthWrite: false,
      // polygonOffset сдвигает пятно к камере в буфере глубины: без этого оно «мерцает»
      // сквозь стену, на которой лежит (z-fighting — две поверхности в одной плоскости).
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const mesh = new THREE.Mesh(this.decalGeometry, material);
    mesh.receiveShadow = true;
    mesh.position.set(point.x + normal.x * 0.005, point.y + normal.y * 0.005, point.z + normal.z * 0.005);
    // Плоскость смотрит по своей оси +Z. lookAt разворачивает её «лицом» вдоль нормали поверхности.
    this.target.set(mesh.position.x + normal.x, mesh.position.y + normal.y, mesh.position.z + normal.z);
    mesh.lookAt(this.target);
    mesh.rotateZ(Math.random() * Math.PI * 2); // одна текстура, но пятна не одинаковые
    return mesh;
  }

  private createBurst(): THREE.Mesh {
    return new THREE.Mesh(
      this.burstGeometry,
      new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, depthWrite: false }),
    );
  }

  private remove(splat: Splat) {
    this.scene.remove(splat.mesh);
    // Материал удаляем явно: three.js не освобождает видеопамять сам.
    (splat.mesh.material as THREE.Material).dispose();
  }
}

/**
 * Текстура кляксы, нарисованная кодом: белые капли на прозрачном фоне.
 * Белый цвет умножается на color материала — одной текстурой красим пятна в любой цвет.
 */
function createSplatTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    const blob = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    blob(64, 64, 30);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 26 + Math.random() * 14;
      blob(64 + Math.cos(angle) * distance, 64 + Math.sin(angle) * distance, 8 + Math.random() * 10);
    }
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 48 + Math.random() * 12;
      blob(64 + Math.cos(angle) * distance, 64 + Math.sin(angle) * distance, 2 + Math.random() * 3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
