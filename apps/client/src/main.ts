import './style.css';
import { PHYSICS_DT, PLAYROOM, buildColliders, type MoveInput } from '@mecha/shared';
import { startFixedStepLoop } from './core/fixed-step-loop';
import { ThirdPersonCamera } from './camera/third-person-camera';
import { Controls } from './input/controls';
import { LocalPlayer } from './player/local-player';
import { buildMap } from './world/map-builder';
import { createSceneContext } from './world/scene-setup';
import { Hud } from './ui/hud';
import { connect } from './network';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

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

const hud = new Hud();
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
  },
  render(alpha, frameDt) {
    const look = controls.consumeLook();
    followCamera.rotate(look.dx, look.dy);
    player.render(alpha, frameDt);
    followCamera.update(player.renderPosition, frameDt);
    renderer.render(scene, camera);
    hud.tick(frameDt);
  },
});

connect({
  onStatus: (state, text) => hud.setStatus(state, text),
  onPing: (rttMs) => hud.setPing(rttMs),
});
