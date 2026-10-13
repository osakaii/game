import './style.css';
import {
  PHYSICS_DT,
  PLAYROOM,
  buildColliders,
  canMove,
  defaultBodyColors,
  type MoveInput,
} from '@mecha/shared';
import { startFixedStepLoop } from './core/fixed-step-loop';
import { ThirdPersonCamera } from './camera/third-person-camera';
import { Controls } from './input/controls';
import { inviteToRoom, roomCodeFromUrl, setRoomInUrl } from './lobby/invite';
import { Lobby } from './lobby/lobby';
import { Network } from './net/network';
import { StateSender } from './net/state-sender';
import { Eyedropper } from './painting/eyedropper';
import { Painter } from './painting/painter';
import { LocalPlayer } from './player/local-player';
import { $ } from './ui/dom';
import { errorMessage } from './ui/error-messages';
import { Hud } from './ui/hud';
import { MenuScreen } from './ui/menu-screen';
import { PaintPanel } from './ui/paint-panel';
import { PhaseHud } from './ui/phase-hud';
import { RoomPanel } from './ui/room-panel';
import { toast } from './ui/toast';
import { buildMap } from './world/map-builder';
import { RemotePlayers } from './world/remote-players';
import { createSceneContext } from './world/scene-setup';

// ---------- 3D-мир ----------

const canvas = $<HTMLCanvasElement>('#scene');
const { renderer, scene, camera } = createSceneContext(canvas);

const map = PLAYROOM;
const colliders = buildColliders(map);
const obstacles = buildMap(scene, map);

const player = new LocalPlayer(map.spawns[0], colliders);
scene.add(player.model.root);

const followCamera = new ThirdPersonCamera(camera, obstacles);
const controls = new Controls({
  surface: canvas,
  joystickBase: $('#joystick'),
  joystickKnob: $('#joystick-knob'),
  jumpButton: $('#jump-button'),
});

// ---------- Сеть и лобби ----------

const hud = new Hud();
const network = new Network();
const lobby = new Lobby(network);

const menu = new MenuScreen(
  {
    onCreate: (nickname) => runLobbyRequest(() => lobby.create(nickname)),
    onJoin: (nickname, code) => runLobbyRequest(() => lobby.join(nickname, code)),
  },
  roomCodeFromUrl(),
);

const roomPanel = new RoomPanel({
  onLeave: () => lobby.leave(),
  onInvite: () => lobby.room && void inviteToRoom(lobby.room.code),
  onStart: () => void lobby.startGame(),
});
const phaseHud = new PhaseHud();

// ---------- Покраска ----------

const painter = new Painter(
  new Eyedropper(camera, canvas, obstacles),
  controls,
  network,
  lobby,
  player.model,
);
const paintPanel = new PaintPanel(painter);

network.on('status', ({ state, text }) => {
  hud.setStatus(state, text);
  menu.setOnline(state === 'online');
  if (state !== 'online' && lobby.isReconnecting) menu.showError('Связь потеряна, переподключаемся…');
});
network.on('ping', (rtt) => hud.setPing(rtt));

// ---------- Синхронизация игроков ----------

const remotePlayers = new RemotePlayers(scene, colliders);
const stateSender = new StateSender((state) => network.sendPlayerState(state));

network.on('snapshot', (snapshot) => remotePlayers.applySnapshot(snapshot, network.playerId));
network.on('teleport', (position) => {
  player.teleport(position);
  stateSender.reset();
});

async function runLobbyRequest(request: () => Promise<boolean>) {
  menu.setBusy(true);
  menu.showError('');
  await request();
  menu.setBusy(false);
}

// Единая точка реакции на «вошли/вышли/изменилась комната».
lobby.on('room', (room) => {
  roomPanel.render(room, network.playerId);
  remotePlayers.applyRoom(room, network.playerId);
  // Свои цвета тоже берём из room:state: сервер — источник правды (например, форма ищущего).
  player.model.setColors(lobby.me?.colors ?? defaultBodyColors());
  paintPanel.render();
  if (room) {
    menu.hide();
    setRoomInUrl(room.code);
  } else {
    menu.show();
    if (!lobby.isReconnecting) setRoomInUrl(null);
  }
  updateControlsEnabled();
});
lobby.on('error', (code) => {
  if (menu.visible) menu.showError(errorMessage(code));
  else toast(errorMessage(code));
});

/** Управление выключено, пока открыто меню или пока ищущий ждёт с закрытыми глазами. */
function updateControlsEnabled() {
  const phase = lobby.room?.phase ?? 'lobby';
  controls.enabled = !menu.visible && canMove(phase, lobby.myRole);
}
updateControlsEnabled();

// ---------- Игровой цикл ----------

// Один объект на всё время игры — не создаём новый каждый шаг физики.
const moveInput: MoveInput = { dirX: 0, dirZ: 0, jump: false };

startFixedStepLoop(PHYSICS_DT, {
  fixedUpdate(dt) {
    // Ось джойстика (вправо/вперёд) переводим в мир относительно направления камеры.
    const axis = controls.moveAxis();
    const f = followCamera.forward();
    // right = (-f.z, f.x): вектор вперёд, повёрнутый на 90° по часовой (вид сверху).
    moveInput.dirX = f.x * axis.y - f.z * axis.x;
    moveInput.dirZ = f.z * axis.y + f.x * axis.x;
    moveInput.jump = controls.consumeJump();
    player.fixedUpdate(moveInput, dt);
    if (lobby.room) stateSender.update(dt, player);
  },
  render(alpha, frameDt) {
    const look = controls.consumeLook();
    followCamera.rotate(look.dx, look.dy);
    player.render(alpha, frameDt);
    remotePlayers.render(network.clock.now(), frameDt);
    followCamera.update(player.renderPosition, frameDt);
    renderer.render(scene, camera);
    hud.tick(frameDt);
    phaseHud.update(lobby.room, lobby.myRole, network.clock.now());
  },
});

// Отладка из консоли браузера: __mecha.remotePlayers, __mecha.player.state ...
// В продакшен-сборке import.meta.env.DEV = false, и Vite вырежет этот блок целиком.
if (import.meta.env.DEV) {
  Object.assign(window, { __mecha: { player, remotePlayers, lobby, network, phaseHud, painter } });
}
