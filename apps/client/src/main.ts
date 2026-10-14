import './style.css';
import {
  PHYSICS_DT,
  PLAYROOM,
  MAPS,
  canMove,
  defaultBodyColors,
  type MoveInput,
} from '@mecha/shared';
import { GameSounds } from './audio/game-sounds';
import { Sfx } from './audio/sfx';
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
import { ScreenWakeLock, setupFullscreenButton, setupRotateHint } from './platform/device';
import { graphics, setShadowsEnabled } from './platform/graphics';
import { SeekerControls } from './seek/seeker-controls';
import { $ } from './ui/dom';
import { errorMessage } from './ui/error-messages';
import { Hud } from './ui/hud';
import { MenuScreen } from './ui/menu-screen';
import { PaintPanel } from './ui/paint-panel';
import { PhaseHud } from './ui/phase-hud';
import { RoomPanel } from './ui/room-panel';
import { SettingsDialog } from './ui/settings-dialog';
import { toast } from './ui/toast';
import { ActiveMap } from './world/active-map';
import { RemotePlayers } from './world/remote-players';
import { Splats } from './world/splats';
import { applyShadows, createSceneContext } from './world/scene-setup';

// ---------- 3D-мир ----------

const canvas = $<HTMLCanvasElement>('#scene');
const sceneContext = createSceneContext(canvas);
const { renderer, scene, camera, sun } = sceneContext;

// Карта по умолчанию, пока не вошли в комнату. Потом — та, что выбрал хост.
const activeMap = new ActiveMap(scene, sun);
activeMap.load(PLAYROOM);

const player = new LocalPlayer(PLAYROOM.spawns[0], activeMap);
scene.add(player.model.root);

const followCamera = new ThirdPersonCamera(camera, activeMap);
const controls = new Controls({
  surface: canvas,
  joystickBase: $('#joystick'),
  joystickKnob: $('#joystick-knob'),
  jumpButton: $('#jump-button'),
  crouchButton: $('#crouch-button'),
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
  onSettings: () => settingsDialog.open(),
});
const settingsDialog = new SettingsDialog((patch) => void lobby.updateSettings(patch));
const phaseHud = new PhaseHud();

// ---------- Покраска ----------

const painter = new Painter(
  new Eyedropper(camera, canvas, activeMap),
  controls,
  network,
  lobby,
  player.model,
);
const paintPanel = new PaintPanel(painter);

// ---------- Поиск ----------

const seekerControls = new SeekerControls(camera, canvas, network, lobby);
const splats = new Splats(scene, activeMap);
controls.onTap = (x, y) => void seekerControls.tap(x, y);

// ---------- Звук и устройство ----------

const sfx = new Sfx();
const gameSounds = new GameSounds(sfx);
const wakeLock = new ScreenWakeLock();
setupFullscreenButton();
setupRotateHint();

const soundButtons = [$<HTMLButtonElement>('#sound-toggle'), $<HTMLButtonElement>('#sound-toggle-room')];
function renderSoundButtons() {
  for (const button of soundButtons) button.textContent = sfx.muted ? 'Звук: выкл' : 'Звук: вкл';
}
for (const button of soundButtons) {
  button.addEventListener('click', () => {
    sfx.setMuted(!sfx.muted);
    renderSoundButtons();

const shadowsButton = $<HTMLButtonElement>('#shadows-toggle');
const renderShadowsButton = () => (shadowsButton.textContent = graphics.shadows ? 'Тени: вкл' : 'Тени: выкл');
shadowsButton.addEventListener('click', () => {
  setShadowsEnabled(!graphics.shadows);
  applyShadows(sceneContext, graphics.shadows);
  renderShadowsButton();
});
renderShadowsButton();
  });
}
renderSoundButtons();

const shadowsButton = $<HTMLButtonElement>('#shadows-toggle');
const renderShadowsButton = () => (shadowsButton.textContent = graphics.shadows ? 'Тени: вкл' : 'Тени: выкл');
shadowsButton.addEventListener('click', () => {
  setShadowsEnabled(!graphics.shadows);
  applyShadows(sceneContext, graphics.shadows);
  renderShadowsButton();
});
renderShadowsButton();

network.on('shot', (shot) => {
  gameSounds.onShot(shot, player.state.position);
  if (shot.point) splats.add(shot.point, !!shot.hitPlayerId);
  if (!shot.hitPlayerId) return;
  if (shot.hitPlayerId === network.playerId) {
    const helper = lobby.room?.settings.foundMode === 'helper';
    toast(helper ? 'Тебя нашли! Теперь ты помогаешь искать' : 'Тебя нашли! Теперь ты призрак — наблюдай');
  } else {
    const nickname = lobby.room?.players.find((p) => p.id === shot.hitPlayerId)?.nickname ?? 'Игрок';
    toast(`${nickname} найден!`);
  }
});

network.on('status', ({ state, text }) => {
  hud.setStatus(state, text);
  menu.setOnline(state === 'online');
  if (state === 'offline' && lobby.room) toast('Связь потеряна, переподключаемся…');
});
network.on('ping', (rtt) => hud.setPing(rtt));

// ---------- Синхронизация игроков ----------

const remotePlayers = new RemotePlayers(scene, activeMap);
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
  // Хост сменил карту — перестраиваем мир. Новую позицию на ней пришлёт сервер (player:teleport).
  if (room && activeMap.load(MAPS[room.settings.mapId])) splats.clear();
  roomPanel.render(room, network.playerId);
  settingsDialog.render(room, lobby.isHost);
  phaseHud.renderScores(room, network.playerId);
  remotePlayers.applyRoom(room, network.playerId);
  // Свои цвета тоже берём из room:state: сервер — источник правды (например, форма ищущего).
  player.model.setColors(lobby.me?.colors ?? defaultBodyColors());
  // Призрак — только в режиме ghost. Помощник ищущих остаётся обычным, в форме ищущего.
  player.model.setGhost(!!lobby.me?.found && lobby.me.role === 'hider');
  paintPanel.render();
  gameSounds.onRoom(room, lobby.myRole);
  // Пока в комнате, экран не гаснет — иначе неподвижный прячущийся «уснёт» и отвалится.
  wakeLock.enabled = !!room;
  if (room) {
    menu.hide();
    setRoomInUrl(room.code);
  } else {
    menu.show();
    setRoomInUrl(null);
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
const moveInput: MoveInput = { dirX: 0, dirZ: 0, jump: false, crouch: false };

// Экран загрузки висит, пока не нарисован первый кадр: бандл скачан, сцена собрана.
let firstFrame = true;
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('hidden');
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
}

startFixedStepLoop(PHYSICS_DT, {
  fixedUpdate(dt) {
    // Ось джойстика (вправо/вперёд) переводим в мир относительно направления камеры.
    const axis = controls.moveAxis();
    const f = followCamera.forward();
    // right = (-f.z, f.x): вектор вперёд, повёрнутый на 90° по часовой (вид сверху).
    moveInput.dirX = f.x * axis.y - f.z * axis.x;
    moveInput.dirZ = f.z * axis.y + f.x * axis.x;
    moveInput.jump = controls.consumeJump();
    moveInput.crouch = controls.enabled && controls.crouch;
    player.fixedUpdate(moveInput, dt);
    if (lobby.room) stateSender.update(dt, player);
  },
  render(alpha, frameDt) {
    const look = controls.consumeLook();
    followCamera.rotate(look.dx, look.dy);
    player.render(alpha, frameDt);
    remotePlayers.render(network.clock.now(), frameDt);
    followCamera.update(player.renderPosition, frameDt, player.state.crouching);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      hideSplash();
    }
    hud.tick(frameDt);
    const serverNow = network.clock.now();
    phaseHud.update(lobby.room, lobby.myRole, serverNow, !!lobby.me?.found && lobby.myRole === 'hider');
    seekerControls.update(serverNow);
    gameSounds.update(lobby.room, serverNow);
    splats.update(frameDt);
  },
});

// Отладка из консоли браузера: __mecha.remotePlayers, __mecha.player.state ...
// В продакшен-сборке import.meta.env.DEV = false, и Vite вырежет этот блок целиком.
if (import.meta.env.DEV) {
  Object.assign(window, { __mecha: { player, remotePlayers, lobby, network, phaseHud, painter, seekerControls, controls, sceneContext, splats, followCamera } });
}
