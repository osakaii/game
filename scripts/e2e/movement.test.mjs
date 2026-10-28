// Античит против честного игрока на карте по умолчанию: бег по площади в реальном времени нашей же физикой.
// Откат сервера (player:teleport после старта) = античит считает честное движение читом — тест падает.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { connect, request } from './client.mjs';
import * as S from '../../packages/shared/dist/index.js';

let socket;
after(() => socket?.close());

test('sprinting across Ala-Too (museum stairs, fountain bridges) gets no rollbacks', { timeout: 120_000 }, async () => {
  ({ socket } = await connect('runner'));
  const created = await request(socket, 'room:create', { nickname: 'Runner' });
  assert.ok(created.ok, JSON.stringify(created));
  // Первая расстановка приходит сразу после создания — её не считаем.
  await new Promise((r) => setTimeout(r, 300));
  const rollbacks = [];
  socket.on('player:teleport', (p) => rollbacks.push(p));

  const map = S.MAPS['ala-too'];
  const colliders = S.buildColliders(map);
  const start = map.spawns[0]; // первый в комнате встаёт на первую точку
  const state = { position: S.vec3(start.x, start.y, start.z), velocity: S.vec3(), grounded: true, crouching: false, pose: 'none' };
  // Через лестницу музея на террасу и обратно, по бульвару, через мостики фонтанов.
  const route = [[-10, -36], [0, -36], [0, -43.5], [0, -36], [12, -30], [12, 20], [0, 26], [0, 66], [20, 70]];
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
    // 20 Гц, как StateSender.
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
  assert.deepEqual(rollbacks, []);
});
