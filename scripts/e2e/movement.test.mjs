// Античит против честного игрока на карте по умолчанию: бег по площади в реальном времени нашей же физикой.
// Откат сервера (player:teleport после старта) = античит считает честное движение читом — тест падает.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { connect, request } from './client.mjs';
import * as S from '../../packages/shared/dist/index.js';
import * as M from '../../packages/shared/dist/world/maps.js';

let socket;
after(() => socket?.close());

/**
 * Войти в новую комнату на карте mapId. Возвращает точку, где сервер поставил игрока.
 * Первая расстановка приходит сразу после создания (и после смены карты) — её не считаем откатом.
 */
async function enterRoom(mapId, start) {
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
  await new Promise((r) => setTimeout(r, 300));
  return start;
}

/**
 * Вести игрока нашей физикой в реальном времени и слать состояние 20 Гц, как StateSender.
 * control(state) — ввод на этот тик или null, когда пора остановиться. Возвращает откаты сервера (player:teleport).
 */
async function drive(mapId, start, control) {
  const rollbacks = [];
  socket.on('player:teleport', (p) => rollbacks.push(p));
  const colliders = S.buildColliders(M.MAPS[mapId]);
  const state = { position: S.vec3(start.x, start.y, start.z), velocity: S.vec3(), grounded: true, crouching: false, pose: 'none' };
  let last = performance.now();
  let physicsTime = 0;
  let sendTime = 0;
  let done = false;
  while (!done) {
    await new Promise((r) => setTimeout(r, 5));
    const now = performance.now();
    physicsTime += (now - last) / 1000;
    sendTime += (now - last) / 1000;
    last = now;
    while (physicsTime >= S.PHYSICS_DT && !done) {
      physicsTime -= S.PHYSICS_DT;
      const input = control(state);
      if (input) S.stepPlayer(state, input, colliders, S.PHYSICS_DT);
      else done = true;
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
  return { rollbacks, state };
}

/** Ввод «бежать к точке» по маршруту; null — маршрут пройден. */
function routeControl(route) {
  let next = 0;
  let sinceProgress = 0;
  return (state) => {
    while (next < route.length) {
      const [tx, tz] = route[next];
      const dx = tx - state.position.x;
      const dz = tz - state.position.z;
      const left = Math.hypot(dx, dz);
      if (left >= 0.6) {
        assert.ok(++sinceProgress < 60 * 15, `stuck on the way to ${route[next]} at ${JSON.stringify(state.position)}`);
        return { dirX: dx / left, dirZ: dz / left, jump: false, crouch: false, sprint: true };
      }
      next++;
      sinceProgress = 0;
    }
    return null;
  };
}

/** Пробежать маршрут (массив точек или функция от точки старта). Возвращает откаты сервера после старта. */
async function sprintRoute(mapId, start, route) {
  start = await enterRoom(mapId, start);
  // Маршрут может зависеть от того, куда сервер поставил игрока.
  if (typeof route === 'function') route = route(start);
  return (await drive(mapId, start, routeControl(route))).rollbacks;
}

test('sprinting across Ala-Too (museum stairs, fountain bridges) gets no rollbacks', { timeout: 120_000 }, async () => {
  // Через лестницу музея на террасу (до стоек витража — они твёрдые) и обратно, по бульвару, через мостики фонтанов.
  const route = [[-10, -36], [0, -36], [0, -42.6], [0, -36], [12, -30], [12, 20], [0, 26], [0, 66], [20, 70]];
  // Первый в комнате встаёт на первую точку появления.
  assert.deepEqual(await sprintRoute('ala-too', M.MAPS['ala-too'].spawns[0], route), []);
});

test('sprinting through the supermarket (stock door, under a gondola and a checkout) gets no rollbacks', { timeout: 120_000 }, async () => {
  const map = M.MAPS.supermarket;
  const passage = (id) => M.SUPERMARKET_PASSAGES.find((p) => p.id === id);
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

test('sprinting through the restaurant (kitchen, service door, between the tables) gets no rollbacks', { timeout: 120_000 }, async () => {
  // Хост после смены карты — на одной из точек кухни (±24, −15). Через кухню к западной служебной двери,
  // в зал и по проходу между рядами столов (через пятно соуса с крошками).
  const route = (start) => [[start.x, -24], [24, -24], [-24, -24], [-24, -9], [-28.5, -9], [-28.5, 7.05], [28.5, 7.05]];
  assert.deepEqual(await sprintRoute('restaurant', M.MAPS.restaurant.spawns[0], route), []);
});

test('climbing the 43 m flagpole on Ala-Too and dropping off gets no rollbacks', { timeout: 120_000 }, async () => {
  // Флагшток — единственный коллайдер площади выше 40 м (невидимые стены — 30 м).
  const pole = S.buildColliders(M.MAPS['ala-too']).find((c) => c.maxY > 40);
  const px = (pole.minX + pole.maxX) / 2;
  const pz = (pole.minZ + pole.maxZ) / 2;
  const start = await enterRoom('ala-too', M.MAPS['ala-too'].spawns[0]);
  const approach = routeControl([[px + 3, pz], [px + 1, pz]]);
  let phase = 'approach';
  let topY = 0;
  let ticks = 0;
  const { rollbacks, state } = await drive('ala-too', start, (s) => {
    ticks++;
    assert.ok(ticks < 60 * 90, `stuck in phase ${phase} at ${JSON.stringify(s.position)}`);
    topY = Math.max(topY, s.position.y);
    if (phase === 'approach') {
      const input = approach(s);
      if (input) return input;
      phase = 'climb';
    }
    // Лезть в столб (−X), пока не окажемся на 40 м; потом — от столба (+X), падать и приземлиться.
    if (phase === 'climb') {
      if (s.position.y < 40) return { dirX: -1, dirZ: 0, jump: false, crouch: false };
      phase = 'drop';
    }
    if (phase === 'drop' && !(s.grounded && s.position.y < 1)) return { dirX: 1, dirZ: 0, jump: false, crouch: false };
    return null;
  });
  assert.ok(topY >= 40, `reached only ${topY.toFixed(1)} m`);
  assert.ok(state.grounded);
  assert.deepEqual(rollbacks, []);
});
