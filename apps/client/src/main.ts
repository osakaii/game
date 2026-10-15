import './style.css';
import {
  PHYSICS_DT,
  PLAYROOM,
  bodyHeight,
  cancelsPose,
  MAPS,
  canMove,
  canPaint,
  isUpdateAvailable,
  type MoveInput,
} from '@mecha/shared';
import { GameSounds } from './audio/game-sounds';
import { CLIENT_BUILD, formatBuild } from './build-info';
import { Sfx } from './audio/sfx';
import { startFixedStepLoop } from './core/fixed-step-loop';
import { ThirdPersonCamera } from './camera/third-person-camera';
import { Controls } from './input/controls';
import { inviteToRoom, roomCodeFromUrl, setRoomInUrl } from './lobby/invite';
import { Lobby } from './lobby/lobby';
import { Network } from './net/network';
import { StateSender } from './net/state-sender';
import { Eyedropper } from './painting/eyedropper';
import { PaintStudio } from './paint/paint-studio';
import { SkinPainter } from './paint/skin-painter';
import { SkinSync } from './paint/skin-sync';
import { LocalPlayer } from './player/local-player';
import { PlayerModel } from './player/player-model';
import { ScreenWakeLock, setupFullscreenButton, setupRotateHint } from './platform/device';
import { graphics, setShadowsEnabled } from './platform/graphics';
import { SeekerControls } from './seek/seeker-controls';
import { SeekerEffects } from './seek/seeker-effects';
import { $ } from './ui/dom';
import { errorMessage } from './ui/error-messages';
import { Hud } from './ui/hud';
import { PoseWheel } from './ui/pose-wheel';
import { MenuScreen } from './ui/menu-screen';
import { StudioToolbar } from './ui/studio-toolbar';
import { PhaseHud } from './ui/phase-hud';
import { RoomPanel } from './ui/room-panel';
import { SettingsDialog } from './ui/settings-dialog';
import { toast } from './ui/toast';
import { UpdateBanner } from './ui/update-banner';
import { ActiveMap } from './world/active-map';
import { RemotePlayers } from './world/remote-players';
import { ShotFx } from './world/shot-fx';
import { Splats } from './world/splats';
import { applyShadows, createSceneContext, setRenderScale } from './world/scene-setup';
import { PerfGovernor } from './core/perf-governor';

// ---------- 3D-мир ----------

const canvas = $<HTMLCanvasElement>('#scene');
const sceneContext = createSceneContext(canvas);
const { renderer, scene, camera, sun } = sceneContext;

// Карта по умолчанию, пока не вошли в комнату. Потом — та, что выбрал хост.
const activeMap = new ActiveMap(scene, sun, sceneContext.renderer);
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
new PoseWheel($<HTMLButtonElement>('#pose-button'), $('#pose-wheel'), controls);

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

// Кожа своего персонажа — на видеокарте (кисть), чужих — пока canvas с цветами зон.
const skinPainter = new SkinPainter(renderer, { forceEightBit: graphics.forceWetEightBit });
skinPainter.resetFrom(player.model.skin.texture);
player.model.setSkinMap(skinPainter.texture);

const studio = new PaintStudio({
  canvas,
  camera,
  scene,
  world: activeMap,
  model: player.model,
  painter: skinPainter,
  eyedropper: new Eyedropper(camera, canvas, activeMap),
});
new StudioToolbar(studio, skinPainter, () => closeStudio());

const paintToggle = $<HTMLButtonElement>('#paint-toggle');
paintToggle.addEventListener('click', () => {
  if (!canUseStudio()) return;
  studio.open(player.facing);
  updateControlsEnabled();
});

/** Мастерская доступна там же, где раньше покраска: в лобби — всем, в прятках — прячущимся. */
function canUseStudio(): boolean {
  const room = lobby.room;
  return !!room && canPaint(room.phase, lobby.myRole);
}

function closeStudio() {
  studio.close();
  updateControlsEnabled();
}

function renderPaintToggle() {
  paintToggle.hidden = !canUseStudio() || studio.active;
}
studio.on('change', renderPaintToggle);

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
  });
}
renderSoundButtons();

// Шорох кисти в Мастерской.
studio.on('stroke', ({ state, speed }) => sfx.brush(state, speed));

const shadowsButton = $<HTMLButtonElement>('#shadows-toggle');
const renderShadowsButton = () => (shadowsButton.textContent = graphics.shadows ? 'Тени: вкл' : 'Тени: выкл');
shadowsButton.addEventListener('click', () => {
  setShadowsEnabled(!graphics.shadows);
  applyShadows(sceneContext, graphics.shadows);
  renderShadowsButton();
});
renderShadowsButton();

// Автокачество: тормозит — сначала выключаем тени, потом облегчаем краску и разрешение.
const perfGovernor = new PerfGovernor(graphics.shadows ? 2 : 1, (level) => {
  if (level <= 1 && graphics.shadows) {
    graphics.shadows = false; // только на эту сессию, сохранённую настройку игрока не трогаем
    applyShadows(sceneContext, false);
    renderShadowsButton();
  }
  if (level === 0) {
    skinPainter.setQuality('low');
    setRenderScale(sceneContext, 1);
  }
  toast('Графика упрощена для плавности');
});

network.on('status', ({ state, text }) => {
  hud.setStatus(state, text);
  menu.setOnline(state === 'online');
  if (state === 'offline' && lobby.room) toast('Связь потеряна, переподключаемся…');
});
network.on('ping', (rtt) => hud.setPing(rtt));

// ---------- Версия ----------

// Версия видна и в меню, и в игре (HUD) — удобно, когда игрок присылает скриншот с багом.
$('#app-version').textContent = formatBuild(CLIENT_BUILD);
$('#hud-version').textContent = formatBuild(CLIENT_BUILD);
const updateBanner = new UpdateBanner();
network.on('welcome', ({ build }) => {
  if (isUpdateAvailable(CLIENT_BUILD, build)) updateBanner.showOptional(build.version);
});
network.on('outdated', () => updateBanner.showRequired());

// ---------- Синхронизация игроков ----------

const remotePlayers = new RemotePlayers(scene, activeMap);

// ---------- Выстрелы: картинка, звук, вибрация ----------

const shotFx = new ShotFx(scene);
const seekerEffects = new SeekerEffects({
  controls: seekerControls,
  player,
  remotePlayers,
  shotFx,
  sfx,
  camera: followCamera,
  world: activeMap,
  myId: () => network.playerId,
});
network.on('shot', (shot) => seekerEffects.onServerShot(shot));
// Пятно, звук и «найден!» — когда капля долетела, а не когда пришёл пакет: так видно причину и следствие.
seekerEffects.onImpact = (shot, impact) => {
  gameSounds.onShot(shot, player.state.position);
  splats.add(impact.point, impact.hit);
  if (!shot.hitPlayerId) return;
  if (shot.hitPlayerId === network.playerId) {
    const helper = lobby.room?.settings.foundMode === 'helper';
    toast(helper ? 'Тебя нашли! Теперь ты помогаешь искать' : 'Тебя нашли! Теперь ты призрак — наблюдай');
  } else {
    const nickname = lobby.room?.players.find((p) => p.id === shot.hitPlayerId)?.nickname ?? 'Игрок';
    toast(`${nickname} найден!`);
  }
};
const stateSender = new StateSender((state) => network.sendPlayerState(state));

network.on('snapshot', (snapshot) => remotePlayers.applySnapshot(snapshot, network.playerId));
const skinSync = new SkinSync(network, lobby, skinPainter, studio, player.model, remotePlayers);
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
  // Сервер мог сбросить кожу (начало раунда, найденный стал помощником) — тогда начинаем с основы.
  skinSync.onRoom();
  // Призрак — только в режиме ghost. Помощник ищущих остаётся обычным, в форме ищущего.
  player.model.setGhost(!!lobby.me?.found && lobby.me.role === 'hider');
  // Ищущий в раунде держит краскомёт — и свой персонаж тоже, его видно со спины.
  player.model.setArmed(!!room && (room.phase === 'hiding' || room.phase === 'seeking') && lobby.myRole === 'seeker');
  // Фаза сменилась на поиск или вышли из комнаты — Мастерская закрывается сама.
  if (studio.active && !canUseStudio()) closeStudio();
  renderPaintToggle();
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
  controls.enabled = !menu.visible && canMove(phase, lobby.myRole) && !studio.active;
}
updateControlsEnabled();

// ---------- Игровой цикл ----------

// Один объект на всё время игры — не создаём новый каждый шаг физики.
const moveInput: MoveInput = { dirX: 0, dirZ: 0, jump: false, crouch: false, pose: 'none' };

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
    moveInput.pose = controls.pose;
    player.fixedUpdate(moveInput, dt);
    // Поза «на месте» снята движением или прыжком — снимаем и выбор, иначе персонаж снова ляжет, едва остановится.
    if (cancelsPose(controls.pose, moveInput)) controls.setPose('none');
    if (lobby.room) stateSender.update(dt, player);
  },
  render(alpha, frameDt) {
    const look = controls.consumeLook();
    followCamera.rotate(look.dx, look.dy);
    player.render(alpha, frameDt);
    // Мокрая краска течёт и сохнет и после закрытия Мастерской.
    skinPainter.update(frameDt);
    remotePlayers.render(network.clock.now(), frameDt);
    if (studio.active) studio.update(player.renderPosition);
    // Присел или лёг — камера опускается следом: видно, что под столом.
    else followCamera.update(player.renderPosition, frameDt, bodyHeight(player.state) < 1.2);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      hideSplash();
    }
    hud.tick(frameDt);
    perfGovernor.tick(frameDt);
    const serverNow = network.clock.now();
    phaseHud.update(lobby.room, lobby.myRole, serverNow, !!lobby.me?.found && lobby.myRole === 'hider');
    seekerControls.update(serverNow);
    gameSounds.update(lobby.room, serverNow);
    splats.update(frameDt);
    shotFx.update(frameDt);
  },
});

// Отладка из консоли браузера: __mecha.remotePlayers, __mecha.player.state ...
// В продакшен-сборке import.meta.env.DEV = false, и Vite вырежет этот блок целиком.
if (import.meta.env.DEV) {
  // Клавиша U — отладка атласа: шахматка со стрелками «вверх» на модели и сама выкройка в углу.
  let atlasDebug = false;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyU' || (e.target as HTMLElement).tagName === 'INPUT') return;
    atlasDebug = !atlasDebug;
    player.model.showDebugPattern(atlasDebug);
    const canvas = player.model.skin.canvas;
    if (!canvas) return;
    canvas.id = 'atlas-debug';
    if (atlasDebug) document.body.append(canvas);
    else canvas.remove();
  });

  // Клавиша H — коробки попаданий у всех персонажей: ровно то, по чему сервер считает выстрел.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyH' || (e.target as HTMLElement).tagName === 'INPUT') return;
    PlayerModel.showHitboxes = !PlayerModel.showHitboxes;
  });

  Object.assign(window, { __mecha: { player, remotePlayers, lobby, network, phaseHud, studio, skinPainter, seekerControls, seekerEffects, shotFx, controls, sceneContext, splats, followCamera } });
}
