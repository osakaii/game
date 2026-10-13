import * as THREE from 'three';
import type { MapDef } from '@mecha/shared';

/**
 * Строит меши карты из MapDef: группу для сцены и список объектов,
 * которые загораживают камеру и в которые попадает луч пипетки (стены, мебель, пол).
 */
export function buildMapGroup(map: MapDef): { group: THREE.Group; obstacles: THREE.Object3D[] } {
  const obstacles: THREE.Object3D[] = [];
  const group = new THREE.Group();
  group.name = `map:${map.name}`;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(map.width, map.depth),
    new THREE.MeshLambertMaterial({ color: map.floorColor }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  obstacles.push(floor);

  // Одна геометрия «единичного куба» на все блоки, размер задаём через scale.
  // Один буфер в видеопамяти вместо сотни.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0); // опорная точка снизу — как y в MapBox

  // Материалы кэшируем по цвету: одинаковые цвета — один материал.
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  const materialFor = (color: string) => {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color });
      materials.set(color, material);
    }
    return material;
  };

  for (const box of map.boxes) {
    const mesh = new THREE.Mesh(unitBox, materialFor(box.color));
    mesh.position.set(box.x, box.y ?? 0, box.z);
    mesh.scale.set(box.w, box.h, box.d);
    group.add(mesh);
    obstacles.push(mesh);
  }

  // Карта статична — один раз считаем матрицы и выключаем пересчёт каждый кадр.
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    object.matrixAutoUpdate = false;
  });

  return { group, obstacles };
}
