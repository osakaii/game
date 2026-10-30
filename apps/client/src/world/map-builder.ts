import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mapBoxes, type MapBox, type MapDef, type SurfaceId } from '@mecha/shared';
import { bevelBoxGeometry } from './bevel-box';
import { buildPaintings } from './paintings';
import { surfaceTexture } from './surfaces';

/**
 * Строит меши карты из MapDef: группу для сцены и список объектов, которые загораживают камеру
 * и в которые попадает луч пипетки (стены, мебель, пол).
 *
 * Главное для телефона — мало вызовов отрисовки. Сотни блоков склеиваются в несколько больших сеток —
 * по одной на поверхность. Цвет блока хранится в его вершинах (vertex colors), поэтому сотни разных
 * цветов (корешки книг!) не плодят материалы. Карта статична, склеить можно один раз.
 */
export function buildMapGroup(map: MapDef): { group: THREE.Group; obstacles: THREE.Object3D[] } {
  const obstacles: THREE.Object3D[] = [];
  const group = new THREE.Group();
  group.name = `map:${map.name}`;

  const floorGeometry = new THREE.PlaneGeometry(map.width, map.depth);
  floorGeometry.rotateX(-Math.PI / 2);
  applyWorldUVs(floorGeometry, map.floorSurface ?? 'paint', map.texScale);
  const floor = new THREE.Mesh(floorGeometry, materialFor(map.floorSurface ?? 'paint', map.floorColor));
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);
  obstacles.push(floor);

  // Потолок — плоскость «лицом» вниз: изнутри видно, сверху нет. Тень от него не падает,
  // иначе солнце не попало бы в комнаты; зато камера в него упирается, как в стену.
  if (map.ceiling) {
    const ceilingGeometry = new THREE.PlaneGeometry(map.width, map.depth);
    ceilingGeometry.rotateX(Math.PI / 2);
    ceilingGeometry.translate(0, map.ceiling.height, 0);
    // Без освещения: снизу на потолок светит только «земляной» рассеянный свет, и он вышел бы бурым.
    // Ровный светлый цвет — как у настоящего белого потолка в светлой комнате.
    const ceiling = new THREE.Mesh(ceilingGeometry, new THREE.MeshBasicMaterial({ color: map.ceiling.color }));
    ceiling.name = 'ceiling';
    group.add(ceiling);
    obstacles.push(ceiling);
  }

  // Блоки по поверхностям -> геометрии в мировых координатах, цвет — в вершинах.
  const batches = new Map<SurfaceId, THREE.BufferGeometry[]>();
  const glowing: THREE.BufferGeometry[] = [];
  const canvases: MapBox[] = [];
  for (const box of mapBoxes(map)) {
    if (box.hidden) continue;
    // Холсты картин — отдельно: у каждого свой сюжет, они собираются в общий атлас.
    if (box.art !== undefined) {
      canvases.push(box);
      continue;
    }
    // Светящееся (стекло окон, плафоны) — без освещения, одной сеткой.
    if (box.glow) {
      glowing.push(boxGeometry(box));
      continue;
    }
    const surface = box.surface ?? 'paint';
    let parts = batches.get(surface);
    if (!parts) {
      parts = [];
      batches.set(surface, parts);
    }
    parts.push(boxGeometry(box));
  }

  for (const [surface, parts] of batches) {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(merged, materialFor(surface, '#ffffff', true));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    obstacles.push(mesh);
  }

  if (glowing.length) {
    const glow = new THREE.Mesh(mergeGeometries(glowing), new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (const part of glowing) part.dispose();
    glow.name = 'glow';
    group.add(glow);
    obstacles.push(glow);
  }

  const paintings = buildPaintings(canvases);
  if (paintings) {
    group.add(paintings);
    obstacles.push(paintings);
  }

  // Карта статична — один раз считаем матрицы и выключаем пересчёт каждый кадр.
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    object.matrixAutoUpdate = false;
  });
  return { group, obstacles };
}

/** Радиус скругления (м), меньше которого ребро рисуем острым: с игровой камеры разницы не видно. */
const MIN_VISIBLE_ROUND = 0.05;

/** Геометрия блока в мировых координатах, с UV «в метрах» — рисунок одного масштаба на любом предмете. */
function boxGeometry(box: MapBox): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  switch (box.shape ?? 'box') {
    // Детализация — по размеру: ручке шкафа и мячику хватит нескольких граней, дивану нужно больше.
    // На телефоне треугольники не бесплатны, а мелочь издалека всё равно выглядит круглой.
    case 'rounded': {
      // Скругление — фаской с гладкими нормалями (bevel-box.ts): 44 треугольника вместо 108 у
      // RoundedBoxGeometry, 92 вместо 300 у крупного. До 30 см радиуса хватает одной полоски на ребро.
      // Скругление меньше 5 см с игровой камеры не видно — это просто коробка (12 треугольников).
      const radius = Math.min(box.round ?? 0.05, box.w / 2, box.h / 2, box.d / 2);
      geometry =
        radius < MIN_VISIBLE_ROUND
          ? new THREE.BoxGeometry(box.w, box.h, box.d)
          : bevelBoxGeometry(box.w, box.h, box.d, radius, radius < 0.3 ? 1 : 2);
      break;
    }
    case 'cylinder': {
      // Единичный цилиндр, растянутый в коробку блока: овальный, если w ≠ d.
      const size = Math.max(box.w, box.d);
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, size < 0.1 ? 8 : size < 0.4 ? 12 : 16);
      geometry.scale(box.w, box.h, box.d);
      break;
    }
    case 'sphere': {
      // Цветок и шарик — мелочь, крона дерева — крупно и на виду: ей сегменты нужнее.
      const size = Math.max(box.w, box.h, box.d);
      const [around, up] = size < 0.3 ? [8, 6] : size < 1.5 ? [10, 7] : [16, 10];
      geometry = new THREE.SphereGeometry(0.5, around, up);
      geometry.scale(box.w, box.h, box.d);
      break;
    }
    default:
      geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
  }
  // Опорная точка блока — центр нижней грани (как y в MapBox).
  geometry.translate(box.x, (box.y ?? 0) + box.h / 2, box.z);
  // Склеивать можно только одинаковые по устройству геометрии: у одних есть индекс, у других нет.
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  applyWorldUVs(flat, box.surface ?? 'paint', box.texScale);
  // Цвет блока — в каждой вершине (линейный, как его ждёт шейдер). Материал общий, белый.
  const color = new THREE.Color(box.color);
  const colors = new Float32Array(flat.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

/**
 * «Кубическая» развёртка (box mapping): каждую вершину проецируем на плоскость, к которой ближе
 * всего её нормаль, и берём координаты в метрах мира, делённые на размер рисунка.
 * Боковые грани: u — по горизонтали, v — вверх (полоски обоев вертикальные на любой стене).
 */
function applyWorldUVs(geometry: THREE.BufferGeometry, surface: SurfaceId, texScale = 1) {
  // У увеличенной карты рисунок увеличен вместе с ней: доска паркета — тоже «огромная».
  const tile = (surfaceTexture(surface)?.tile ?? 1) * texScale;
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

function materialFor(surface: SurfaceId, color: string, vertexColors = false): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, vertexColors, map: surfaceTexture(surface)?.texture ?? null });
}
