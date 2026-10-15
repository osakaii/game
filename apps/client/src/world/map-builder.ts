import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mapBoxes, type MapBox, type MapDef, type SurfaceId } from '@mecha/shared';
import { surfaceTexture } from './surfaces';

/**
 * Строит меши карты из MapDef: группу для сцены и список объектов, которые загораживают камеру
 * и в которые попадает луч пипетки (стены, мебель, пол).
 *
 * Главное для телефона — мало вызовов отрисовки. Сотни блоков склеиваются в несколько больших сеток:
 * по одной на пару «поверхность + цвет» (у них общий материал). Карта статична, склеить можно один раз.
 */
export function buildMapGroup(map: MapDef): { group: THREE.Group; obstacles: THREE.Object3D[] } {
  const obstacles: THREE.Object3D[] = [];
  const group = new THREE.Group();
  group.name = `map:${map.name}`;

  const floorGeometry = new THREE.PlaneGeometry(map.width, map.depth);
  floorGeometry.rotateX(-Math.PI / 2);
  applyWorldUVs(floorGeometry, map.floorSurface ?? 'paint');
  const floor = new THREE.Mesh(floorGeometry, materialFor(map.floorSurface ?? 'paint', map.floorColor));
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);
  obstacles.push(floor);

  // Блоки по материалам: ключ «поверхность|цвет» -> геометрии в мировых координатах.
  const batches = new Map<string, { surface: SurfaceId; color: string; parts: THREE.BufferGeometry[] }>();
  for (const box of mapBoxes(map)) {
    if (box.hidden) continue;
    const surface = box.surface ?? 'paint';
    const key = `${surface}|${box.color}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { surface, color: box.color, parts: [] };
      batches.set(key, batch);
    }
    batch.parts.push(boxGeometry(box));
  }

  for (const { surface, color, parts } of batches.values()) {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(merged, materialFor(surface, color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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

/** Геометрия блока в мировых координатах, с UV «в метрах» — рисунок одного масштаба на любом предмете. */
function boxGeometry(box: MapBox): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  switch (box.shape ?? 'box') {
    case 'rounded': {
      const radius = Math.min(box.round ?? 0.05, box.w / 2, box.h / 2, box.d / 2);
      geometry = new RoundedBoxGeometry(box.w, box.h, box.d, 3, radius);
      break;
    }
    case 'cylinder':
      // Единичный цилиндр, растянутый в коробку блока: овальный, если w ≠ d.
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
      geometry.scale(box.w, box.h, box.d);
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(0.5, 20, 14);
      geometry.scale(box.w, box.h, box.d);
      break;
    default:
      geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
  }
  // Опорная точка блока — центр нижней грани (как y в MapBox).
  geometry.translate(box.x, (box.y ?? 0) + box.h / 2, box.z);
  // Склеивать можно только одинаковые по устройству геометрии: у одних есть индекс, у других нет.
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  applyWorldUVs(flat, box.surface ?? 'paint');
  return flat;
}

/**
 * «Кубическая» развёртка (box mapping): каждую вершину проецируем на плоскость, к которой ближе
 * всего её нормаль, и берём координаты в метрах мира, делённые на размер рисунка.
 * Боковые грани: u — по горизонтали, v — вверх (полоски обоев вертикальные на любой стене).
 */
function applyWorldUVs(geometry: THREE.BufferGeometry, surface: SurfaceId) {
  const tile = surfaceTexture(surface)?.tile ?? 1;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function materialFor(surface: SurfaceId, color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, map: surfaceTexture(surface)?.texture ?? null });
}
