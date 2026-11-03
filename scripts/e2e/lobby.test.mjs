// Лобби и раунд целиком через сеть: то, чего не видят юнит-тесты сервисов, — gateway, zod-схемы, рассылки.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { URL, connect, request, waitFor } from './client.mjs';

const sockets = [];
after(() => sockets.forEach((s) => s.close()));

test('health answers 200', async () => {
  const res = await fetch(`${URL}/health`);
  assert.equal(res.status, 200);
});

test('two players create and join a room on the default map, and a round starts', async () => {
  const host = await connect('host');
  const guest = await connect('guest');
  sockets.push(host.socket, guest.socket);

  const created = await request(host.socket, 'room:create', { nickname: 'Host' });
  assert.ok(created.ok, JSON.stringify(created));
  assert.equal(created.data.settings.mapId, 'ala-too');
  assert.equal(created.data.settings.seekSeconds, 240);

  const joined = await request(guest.socket, 'room:join', { nickname: 'Guest', code: created.data.code });
  assert.ok(joined.ok, JSON.stringify(joined));
  assert.equal(joined.data.players.length, 2);

  // Чужой код — понятная ошибка, а не тишина.
  const missing = await request(guest.socket, 'room:join', { nickname: 'Guest', code: 'ZZZZ' });
  assert.equal(missing.ok, false);

  // Не хост не может менять настройки.
  const notHost = await request(guest.socket, 'room:settings', { hideSeconds: 10 });
  assert.equal(notHost.error, 'NOT_HOST');
  // Смена карты приносит её время поиска.
  // Ждём рассылку ДО запроса: room:state приходит раньше, чем ack.
  const changed = waitFor(guest.socket, 'room:state', (s) => s.settings.mapId === 'apartment');
  assert.ok((await request(host.socket, 'room:settings', { mapId: 'apartment' })).ok);
  const settled = await changed;
  assert.equal(settled.settings.seekSeconds, 150);
  // В лобби новой комнаты — день; раунд приносит другое время суток, одно на всех.
  assert.equal(settled.daytime, 'day');

  const hiding = waitFor(guest.socket, 'room:state', (s) => s.phase === 'hiding');
  assert.ok((await request(host.socket, 'game:start')).ok);
  const state = await hiding;
  const roles = state.players.map((p) => p.role).sort();
  assert.deepEqual(roles, ['hider', 'seeker']);
  assert.ok(['morning', 'sunset', 'dusk'].includes(state.daytime), state.daytime);
});

test('a room restored after a server restart keeps its code; a late second restorer joins it', async () => {
  const a = await connect('restore-a');
  const b = await connect('restore-b');
  sockets.push(a.socket, b.socket);
  // Случайный код: комната прошлого прогона ещё живёт 60 с (игроку дают время вернуться).
  // Только буквы алфавита кодов (без похожих I, L, O): иначе сервер отвергнет код как неверный.
  const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');

  const first = await request(a.socket, 'room:create', { nickname: 'A', code });
  assert.ok(first.ok, JSON.stringify(first));
  assert.equal(first.data.code, code);
  assert.equal((await request(b.socket, 'room:create', { nickname: 'B', code })).error, 'ROOM_EXISTS');
  assert.ok((await request(b.socket, 'room:join', { nickname: 'B', code })).ok);
});

test('hints: hiders whistle from the second half of seeking, everyone in the room hears it', { timeout: 60_000 }, async () => {
  const host = await connect('hint-host');
  const guest = await connect('hint-guest');
  sockets.push(host.socket, guest.socket);
  const created = await request(host.socket, 'room:create', { nickname: 'Host' });
  assert.ok(created.ok, JSON.stringify(created));
  assert.equal(created.data.settings.hints, true);
  assert.ok((await request(guest.socket, 'room:join', { nickname: 'Guest', code: created.data.code })).ok);
  // Самый короткий раунд, что пускает схема: 10 с пряток, 30 с поиска → свист на 15-й секунде поиска.
  assert.ok((await request(host.socket, 'room:settings', { hideSeconds: 10, seekSeconds: 30 })).ok);

  const hidingState = waitFor(host.socket, 'room:state', (s) => s.phase === 'hiding');
  assert.ok((await request(host.socket, 'game:start')).ok);
  const hider = (await hidingState).players.find((p) => p.role === 'hider');
  const [hostPing, guestPing] = await Promise.all([
    waitFor(host.socket, 'hint:ping', () => true, 40_000),
    waitFor(guest.socket, 'hint:ping', () => true, 40_000),
  ]);
  assert.deepEqual(hostPing, guestPing);
  assert.deepEqual(hostPing.players.map((p) => p.id), [hider.id]);
});

test('gaze: a seeker looking at the hider earns them points, only the hider is told', { timeout: 60_000 }, async () => {
  const host = await connect('gaze-host');
  const guest = await connect('gaze-guest');
  sockets.push(host.socket, guest.socket);
  const created = await request(host.socket, 'room:create', { nickname: 'Host' });
  assert.ok(created.ok, JSON.stringify(created));
  assert.ok((await request(guest.socket, 'room:join', { nickname: 'Guest', code: created.data.code })).ok);
  // «Детская»: с точек ищущих видны все точки прячущихся. Подсказки выключены — свист тут ни к чему.
  assert.ok((await request(host.socket, 'room:settings', { mapId: 'playroom', hideSeconds: 10, seekSeconds: 30, hints: false })).ok);

  // Где сервер поставит каждого при старте — подписка ДО запроса.
  const spawned = (socket) => waitFor(socket, 'player:teleport');
  const [hostAt, guestAt] = [spawned(host.socket), spawned(guest.socket)];
  const seeking = waitFor(host.socket, 'room:state', (s) => s.phase === 'seeking', 20_000);
  assert.ok((await request(host.socket, 'game:start')).ok);
  const where = { [host.welcome.playerId]: await hostAt, [guest.welcome.playerId]: await guestAt };
  const room = await seeking;
  const seekerId = room.players.find((p) => p.role === 'seeker').id;
  const seeker = seekerId === host.welcome.playerId ? host : guest;
  const hider = seeker === host ? guest : host;
  const from = where[seekerId];
  const to = where[hider.welcome.playerId];

  // Камера ищущего — прямо на прячущегося (как у ThirdPersonCamera: «вперёд» = (−sin yaw, −sin pitch, −cos yaw)).
  const dx = to.x - from.x;
  const dy = to.y + 0.8 - (from.y + 1.35);
  const dz = to.z - from.z;
  const look = { yaw: Math.atan2(-dx, -dz), pitch: Math.asin(-dy / Math.hypot(dx, dy, dz)) };
  let seekerTold = false;
  seeker.socket.on('gaze:update', () => (seekerTold = true));
  const pointed = waitFor(hider.socket, 'gaze:update', (u) => u.points >= 1, 10_000);
  seeker.socket.emit('player:state', { ...from, yaw: 0, grounded: true, crouching: false, pose: 'none', climbing: false, sprinting: false, look });
  const update = await pointed;
  assert.equal(update.watched, true);
  // Ищущему о взгляде не сообщают: иначе он узнал бы, что смотрит прямо на прячущегося.
  assert.equal(seekerTold, false);
});
