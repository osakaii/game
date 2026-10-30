import { describe, expect, it } from 'vitest';
import { PLAYER, penetratesColliders, supportHeight } from '../../src/physics.js';
import { buildColliders, mapBoxes, type MapBox, type MapDef } from '../../src/world/map.js';
import { POSE_RULES } from '../../src/poses.js';
import { MAPS, MAP_IDS } from '../../src/world/maps.js';
import { APARTMENT, APARTMENT_ROOM_CENTERS } from '../../src/world/apartment.js';

/** Насколько тело может уйти в видимый, но проходимый блок (листва, вода, ткань): чуть-чуть — живо, больше — прятки «в текстуре». */
const MAX_SINK = 0.25;
/** Уже тела (цилиндр 0.7 м) декорация целиком никого не скроет: кружка, мячик, книга. */
const BODY_WIDTH = PLAYER.radius * 2 * 0.85;
/** Ниже всего тело лёжа: где не встать, можно лечь — и тоже уйти в декорацию. */
const LOWEST_BODY = Math.min(...Object.values(POSE_RULES).map((rule) => rule.height));

/**
 * Где игрок может уйти в декорацию: точки внутри видимых проходимых блоков (solid: false), под которыми
 * есть опора, на которой помещается тело (стоя или хотя бы лёжа). Достижимость не считаем — прыжки
 * и лазание слишком хитрые; правило строже нужного: любую такую декорацию делаем твёрдой или тоньше.
 */
function sinkSpots(map: MapDef): string[] {
  const colliders = buildColliders(map);
  const spots: string[] = [];
  const decor = mapBoxes(map).filter((b) => b.solid === false && !b.hidden && b.h > MAX_SINK && Math.min(b.w, b.d) >= BODY_WIDTH);
  for (const b of decor) {
    const bottom = b.y ?? 0;
    const worst = sinkInto(b, bottom, colliders);
    if (worst > MAX_SINK) spots.push(`${b.color} ${b.shape ?? 'box'} ${b.w.toFixed(2)}×${b.h.toFixed(2)}×${b.d.toFixed(2)} в (${b.x.toFixed(1)}, ${bottom.toFixed(1)}, ${b.z.toFixed(1)}): ${worst.toFixed(2)} м`);
  }
  return spots;
}

/** Глубже всего, на сколько тело уходит в блок (м), по сетке точек внутри его следа. */
function sinkInto(b: MapBox, bottom: number, colliders: ReturnType<typeof buildColliders>): number {
  const inset = 0.05;
  const nx = Math.max(1, Math.ceil((b.w - 2 * inset) / 0.3));
  const nz = Math.max(1, Math.ceil((b.d - 2 * inset) / 0.3));
  let worst = 0;
  for (let i = 0; i <= nx; i++) {
    for (let k = 0; k <= nz; k++) {
      const x = b.x - b.w / 2 + inset + ((b.w - 2 * inset) * i) / nx;
      const z = b.z - b.d / 2 + inset + ((b.d - 2 * inset) * k) / nz;
      // Опора на уровне верха блока или ниже: на ней игрок и стоял бы внутри декорации.
      const y = supportHeight({ x, y: bottom + b.h, z }, colliders);
      const height = !penetratesColliders({ x, y, z }, colliders, 0) ? PLAYER.height : LOWEST_BODY;
      if (height === LOWEST_BODY && penetratesColliders({ x, y, z }, colliders, 0, LOWEST_BODY)) continue;
      worst = Math.max(worst, Math.min(bottom + b.h, y + height) - Math.max(bottom, y));
    }
  }
  return worst;
}

/**
 * Проверки карт, которые легко сломать руками: точка появления внутри шкафа
 * означает, что игрок застрянет с первой секунды, а сервер будет откатывать каждое движение.
 */
describe.each(MAP_IDS)('map %s', (id) => {
  const map = MAPS[id];
  const colliders = buildColliders(map);

  it('has an id matching its registry key', () => {
    expect(map.id).toBe(id);
  });

  it('spawns are inside the map and not inside furniture', () => {
    const showcase = map.showcase ? [map.showcase.position] : [];
    for (const spawn of [...map.spawns, ...map.seekerSpawns, ...showcase]) {
      expect(Math.abs(spawn.x)).toBeLessThan(map.width / 2);
      expect(Math.abs(spawn.z)).toBeLessThan(map.depth / 2);
      expect(penetratesColliders(spawn, colliders, 0), `spawn ${JSON.stringify(spawn)}`).toBe(false);
    }
  });

  it('the main-screen spot stands on the ground with room for the camera in front', () => {
    if (!map.showcase) return;
    const { position, facing } = map.showcase;
    expect(supportHeight(position, colliders)).toBeCloseTo(position.y, 3);
    // Камера витрины — в 3–5 м перед лицом: там не должно быть ничего, иначе она упрётся в куст.
    for (let d = 0.5; d <= 5; d += 0.5) {
      const point = { x: position.x + Math.sin(facing) * d, y: position.y, z: position.z + Math.cos(facing) * d };
      expect(penetratesColliders(point, colliders, 0), `${d} м перед витриной`).toBe(false);
    }
  });

  it('no decoration lets a player sink in deeper than a hand: hiding inside "textures" is not a strategy', () => {
    expect(sinkSpots(map)).toEqual([]);
  });

  it('has enough spawns for a full room', () => {
    expect(map.spawns.length).toBeGreaterThanOrEqual(4);
    expect(map.seekerSpawns.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Проходимость: от точки появления можно дойти до каждой комнаты. Проверяем «заливкой» по сетке
 * 25 см: клетка проходима, если цилиндр игрока (стоя) в ней ни во что не упирается. Узкий проём
 * или шкаф поперёк двери — и комната станет недостижимой, тест это поймает.
 */
describe('apartment', () => {
  const colliders = buildColliders(APARTMENT);
  const step = 0.25;
  const halfW = APARTMENT.width / 2;
  const halfD = APARTMENT.depth / 2;
  const cols = Math.floor(APARTMENT.width / step);
  const rows = Math.floor(APARTMENT.depth / step);
  const cell = (i: number, j: number) => ({ x: -halfW + (i + 0.5) * step, y: 0, z: -halfD + (j + 0.5) * step });
  // Низкое (ковёр, ступенька) не мешает — игрок на него наступает, как в физике (stepHeight).
  const free = (i: number, j: number) => {
    const c = cell(i, j);
    const ground = supportHeight({ ...c, y: PLAYER.stepHeight }, colliders);
    return !penetratesColliders({ ...c, y: ground }, colliders, 0.02);
  };

  const reached = new Uint8Array(cols * rows);
  const start = APARTMENT.spawns[0];
  const queue: [number, number][] = [[Math.floor((start.x + halfW) / step), Math.floor((start.z + halfD) / step)]];
  reached[queue[0][1] * cols + queue[0][0]] = 1;
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || reached[nj * cols + ni] || !free(ni, nj)) continue;
      reached[nj * cols + ni] = 1;
      queue.push([ni, nj]);
    }
  }

  it.each(Object.entries(APARTMENT_ROOM_CENTERS))('room %s is reachable from the hall', (_name, center) => {
    // Центр комнаты может быть занят столом — ищем достижимую клетку в радиусе 4 м.
    const ci = Math.floor((center.x + halfW) / step);
    const cj = Math.floor((center.z + halfD) / step);
    let found = false;
    for (let di = -16; di <= 16 && !found; di++) {
      for (let dj = -16; dj <= 16 && !found; dj++) {
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < cols && j < rows && reached[j * cols + i]) found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('every painting hangs on a wall at eye level, not in the air', () => {
    const paintings = (APARTMENT.props ?? []).filter((p) => p.prop === 'painting');
    expect(paintings.length).toBeGreaterThanOrEqual(8);
    for (const p of paintings) expect(p.y).toBeGreaterThan(1);
  });
});
