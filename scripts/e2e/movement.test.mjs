// Античит против честного игрока на карте по умолчанию: бег по площади в реальном времени нашей же физикой.
// Откат сервера (player:teleport после старта) = античит считает честное движение читом — тест падает.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { connect, request } from './client.mjs';
import * as S from '../../packages/shared/dist/index.js';

let socket;
after(() => socket?.close());

/**
 * Бежать по маршруту нашей физикой в реальном времени и слать состояние 20 Гц, как StateSender.
 * Возвращает откаты сервера (player:teleport) после старта.
 */
async function sprintRoute(mapId, start, route) {
  ({ socket } = await connect('runner'));
  const created = await request(socket, 'room:create', { nickname: 'Runner' });
  assert.ok(created.ok, JSON.stringify(created));
  if (mapId !== 'ala-too') {
    // Смена карты переставляет игроков: где окажемся — скажет сервер (подписка ДО запроса).
    const moved = new Promise((resolve) => socket.once('player:teleport', resolve));
    const changed = await request(socket, 'room:settings', { mapId });
    assert.ok(changed.ok, JSON.stringify(changed));
    start = await moved;
  }
  // Первая расстановка приходит сразу после создания (и после смены карты) — её не считаем.
  await new Promise((r) => setTimeout(r, 300));
  const rollbacks = [];
  socket.on('player:teleport', (p) => rollbacks.push(p));

  const colliders = S.buildColliders(S.MAPS[mapId]);
  const state = { position: S.vec3(start.x, start.y, start.z), velocity: S.vec3(), grounded: true, crouching: false, pose: 'none' };
  let next = 0;
  let sinceProgress = 0;
  let last = performance.now();
  let physicsTime = 0;
  let sendTime = 0;
  while (next < route.length) {
    await new Promise((r) => setTimeout(r, 5));
    const now = performance.now();
    physicsTime += (now - last) / 1000;
    sendTime += (now - last) / 1000;
    last = now;
    while (physicsTime >= S.PHYSICS_DT && next < route.length) {
      physicsTime -= S.PHYSICS_DT;
      const [tx, tz] = route[next];
      const dx = tx - state.position.x;
      const dz = tz - state.position.z;
      const left = Math.hypot(dx, dz);
      if (left < 0.6) {
        next++;
        sinceProgress = 0;
        continue;
      }
      S.stepPlayer(state, { dirX: dx / left, dirZ: dz / left, jump: false, crouch: false, sprint: true }, colliders, S.PHYSICS_DT);
      assert.ok(++sinceProgress < 60 * 15, `stuck on the way to ${route[next]} at ${JSON.stringify(state.position)}`);
    }
    if (sendTime >= 0.05) {
      sendTime = 0;
      const p = state.position;
      socket.volatile.emit('player:state', {
        x: p.x, y: p.y, z: p.z, yaw: 0, grounded: state.grounded, crouching: false, pose: 'none',
        climbing: !!state.climbing, sprinting: !!state.sprinting,
      });
    }
  }
  await new Promise((r) => setTimeout(r, 300));
  socket.close();
  return rollbacks;
}

test('sprinting across Ala-Too (museum stairs, fountain bridges) gets no rollbacks', { timeout: 120_000 }, async () => {
  // Через лестницу музея на террасу (до стоек витража — они твёрдые) и обратно, по бульвару, через мостики фонтанов.
  const route = [[-10, -36], [0, -36], [0, -42.6], [0, -36], [12, -30], [12, 20], [0, 26], [0, 66], [20, 70]];
  // Первый в комнате встаёт на первую точку появления.
  assert.deepEqual(await sprintRoute('ala-too', S.MAPS['ala-too'].spawns[0], route), []);
});

test('sprinting through the supermarket (stock door, under a gondola and a checkout) gets no rollbacks', { timeout: 120_000 }, async () => {
  const map = S.MAPS.supermarket;
  const passage = (id) => S.SUPERMARKET_PASSAGES.find((p) => p.id === id);
  const gondola = passage('under-gondola');
  const belt = passage('under-belt');
  // Хост после смены карты — на одной из точек склада (±24, −24): идём к западной двери.
  const route = [
    [-24, -24.3], [-24, -16.5], [-24, -0.6],
    [gondola.from.x, -0.6], [gondola.from.x, gondola.from.z], [gondola.to.x, gondola.to.z],
    // По проходу между стеллажами к кассам, вдоль витрины — и под лентой первой кассы.
    [-9, gondola.to.z], [-9, 18.6], [belt.from.x - 3, 18.6], [belt.from.x - 3, belt.from.z],
    [belt.from.x, belt.from.z], [belt.to.x, belt.to.z],
  ];
  assert.deepEqual(await sprintRoute('supermarket', map.spawns[0], route), []);
});
