import * as THREE from 'three';
import { BODY_HITBOXES, HIT_INFLATE, type StanceKey } from '@mecha/shared';

/** Одна геометрия на положение тела — общая для всех игроков. */
const cache = new Map<StanceKey, THREE.BufferGeometry>();
const material = new THREE.LineBasicMaterial({ color: '#ffe14d', depthTest: false, transparent: true, opacity: 0.8 });

/**
 * Отладка (только dev, клавиша H): рёбра коробок попаданий с запасом HIT_INFLATE — ровно то,
 * по чему сервер считает попадание. Видно, совпадает ли «куда целюсь» с «куда попаду».
 */
export function hitboxLines(stance: StanceKey): THREE.LineSegments {
  const lines = new THREE.LineSegments(geometryFor(stance), material);
  lines.renderOrder = 20;
  lines.name = 'hitboxes';
  return lines;
}

export function geometryFor(stance: StanceKey): THREE.BufferGeometry {
  let geometry = cache.get(stance);
  if (!geometry) {
    const parts = BODY_HITBOXES[stance].map(([minX, minY, minZ, maxX, maxY, maxZ]) => {
      const i = HIT_INFLATE;
      const box = new THREE.BoxGeometry(maxX - minX + 2 * i, maxY - minY + 2 * i, maxZ - minZ + 2 * i);
      box.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      const edges = new THREE.EdgesGeometry(box);
      box.dispose();
      return edges;
    });
    const positions = parts.flatMap((g) => Array.from(g.getAttribute('position').array));
    for (const g of parts) g.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    cache.set(stance, geometry);
  }
  return geometry;
}
