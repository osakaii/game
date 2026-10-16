import * as THREE from 'three';
import { buildColliders, type Aabb, type MapDef } from '@mecha/shared';
import { buildMapGroup } from './map-builder';
import { refreshShadows } from './scene-setup';

/** То, что нужно физике (коллайдеры) и лучам камеры/пипетки (меши) — без знания о смене карт. */
export interface WorldGeometry {
  readonly colliders: readonly Aabb[];
  readonly obstacles: readonly THREE.Object3D[];
}

/**
 * Текущая карта. Хост может сменить её в лобби, поэтому все, кому нужна геометрия мира,
 * получают ссылку на этот объект и каждый раз читают актуальные colliders/obstacles,
 * а не сохраняют массив один раз при старте.
 */
export class ActiveMap implements WorldGeometry {
  colliders: Aabb[] = [];
  obstacles: THREE.Object3D[] = [];
  private def: MapDef | null = null;
  private group: THREE.Group | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly renderer?: THREE.WebGLRenderer,
  ) {}

  get current(): MapDef | null {
    return this.def;
  }

  /** Возвращает true, если карта действительно сменилась. */
  load(def: MapDef): boolean {
    if (this.def?.id === def.id) return false;
    this.unload();

    const { group, obstacles } = buildMapGroup(def);
    this.scene.add(group);
    this.group = group;
    this.obstacles = obstacles;
    this.colliders = buildColliders(def);
    this.def = def;
    this.scene.background = new THREE.Color(def.skyColor ?? '#9ad1ff');
    this.fitShadowCamera(def);
    // Тени запечены: новая карта — новая карта теней (один раз, на следующем кадре).
    if (this.renderer) refreshShadows({ renderer: this.renderer });
    return true;
  }

  /**
   * Тень солнца считается в ортографической «коробке». Она должна покрывать всю карту:
   * больше — тени размытые (те же 1024² пикселей на большую площадь), меньше — у краёв теней нет.
   */
  private fitShadowCamera(def: MapDef) {
    const half = Math.max(def.width, def.depth) / 2 + 2;
    // Солнце отодвигаем по его направлению за пределы карты: «коробка» теней строится от него,
    // и на большой карте близкое солнце оставило бы дальний край без теней.
    const direction = this.sun.position.clone().sub(this.sun.target.position).normalize();
    const distance = half * 2 + (def.ceiling?.height ?? 10);
    this.sun.position.copy(this.sun.target.position).addScaledVector(direction, distance);
    const camera = this.sun.shadow.camera;
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.near = 1;
    camera.far = distance * 2;
    camera.updateProjectionMatrix();
  }

  /**
   * Удалить меши из сцены мало: геометрии и материалы занимают видеопамять,
   * и three.js не освободит её, пока не вызвать dispose().
   */
  private unload() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose(); // повторный dispose общей геометрии безопасен
        (object.material as THREE.Material).dispose();
      }
    });
    this.group = null;
  }
}
