import * as THREE from 'three';
import { GAME_RULES, type ShotEvent } from '@mecha/shared';
import type { Sfx } from '../audio/sfx';
import type { ThirdPersonCamera } from '../camera/third-person-camera';
import type { LocalPlayer } from '../player/local-player';
import type { PlayerModel } from '../player/player-model';
import type { WorldGeometry } from '../world/active-map';
import type { RemotePlayers } from '../world/remote-players';
import type { Impact, Shot, ShotFx } from '../world/shot-fx';
import type { FireEvent, FireResult, SeekerControls } from './seeker-controls';

/** Дальше этого расстояния (м) чужой выстрел почти не слышен. */
const HEARING_DISTANCE = 22;
/** Куда «смотрит» капля, если луч ни во что не упёрся. */
const FALLBACK_RANGE = GAME_RULES.shotRange;

interface Deps {
  controls: SeekerControls;
  player: LocalPlayer;
  remotePlayers: RemotePlayers;
  shotFx: ShotFx;
  sfx: Sfx;
  camera: ThirdPersonCamera;
  world: WorldGeometry;
  myId: () => string | null;
}

/**
 * Ощущения от выстрела — всё, кроме правил (правила на сервере).
 *
 * Свой выстрел: в момент тапа — разворот к цели, рука с краскомётом вскидывается, вспышка, «пфт»,
 * вибрация, камеру чуть подбрасывает; капля летит туда, куда целились. Ответ сервера: попал —
 * маркер попадания, «дзынь», встряска; промах — пятно там, где краска реально упала. Над местом тапа
 * кольцо перезарядки, бак краскомёта наполняется — видно, когда можно снова.
 *
 * Чужой выстрел: ищущий в мире разворачивается и стреляет из своего краскомёта, капля летит к точке,
 * звук тем тише, чем дальше. Прячущийся слышит и видит, что ищущий рядом.
 */
export class SeekerEffects {
  private readonly ownShots = new Map<number, Shot>();
  private readonly events = new Map<Shot, ShotEvent>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly muzzle = new THREE.Vector3();

  /** Капля долетела и итог известен: пятно, звук «шлёп»/«найден», тосты. */
  onImpact: ((event: ShotEvent, impact: Impact) => void) | null = null;

  constructor(private readonly deps: Deps) {
    deps.controls.on('fire', (fire) => this.onFire(fire));
    deps.controls.on('result', (result) => this.onResult(result));
    deps.shotFx.onImpact = (impact, shot) => {
      const event = this.events.get(shot);
      this.events.delete(shot);
      if (event) this.onImpact?.(event, impact);
    };
  }

  /** Сервер разослал выстрел всем (и нам — свой тоже). */
  onServerShot(event: ShotEvent): void {
    const { shotFx } = this.deps;
    const point = event.point ? new THREE.Vector3(event.point.x, event.point.y, event.point.z) : null;
    const hit = !!event.hitPlayerId;
    if (event.seekerId === this.deps.myId()) {
      const shot = shotFx.confirmOwn(point, hit);
      if (shot) this.events.set(shot, event);
      return;
    }
    if (!point) return;
    const seeker = this.deps.remotePlayers.get(event.seekerId);
    const from = new THREE.Vector3();
    if (!seeker || !seeker.model.muzzlePosition(from)) {
      // Ищущего не видно (не пришёл снимок) — капля «падает» с высоты, место всё равно отмечено.
      from.copy(point).add(new THREE.Vector3(0, 2, 0));
    }
    const direction = point.clone().sub(from).normalize();
    if (seeker) this.recoil(seeker.model, direction, hit ? GAME_RULES.shotCooldownHitMs : GAME_RULES.shotCooldownMissMs);
    this.events.set(shotFx.fireRemote(from, point, hit, direction), event);
    const listener = this.deps.player.state.position;
    const distance = Math.hypot(from.x - listener.x, from.y - listener.y, from.z - listener.z);
    this.deps.sfx.shoot(Math.max(0.08, 1 - distance / HEARING_DISTANCE));
  }

  private onFire(fire: FireEvent) {
    const { player, shotFx, sfx, camera } = this.deps;
    const predicted = this.predict(fire);
    const from = player.model.muzzlePosition(this.muzzle)
      ? this.muzzle.clone()
      : player.renderPosition.clone().add(new THREE.Vector3(0, 1.2, 0));
    const direction = predicted.clone().sub(from).normalize();

    player.faceTowards(Math.atan2(direction.x, direction.z));
    // Перезарядку точно знает только сервер — пока ставим промах (длиннее), ответ поправит.
    this.recoil(player.model, direction, GAME_RULES.shotCooldownMissMs);
    this.ownShots.set(fire.id, shotFx.fireOwn(from, predicted, direction));
    sfx.shoot(1);
    navigator.vibrate?.(12);
    camera.kick(0.035);
  }

  private onResult({ fire, result, cooldownMs }: FireResult) {
    const shot = this.ownShots.get(fire.id);
    this.ownShots.delete(fire.id);
    if (!result) {
      if (shot) this.deps.shotFx.cancelOwn(shot);
      return;
    }
    this.deps.player.model.setReload(cooldownMs / 1000);
    showCooldownRing(fire.x, fire.y, cooldownMs);
    if (result.hitPlayerId) {
      showHitMarker(fire.x, fire.y);
      showFloatingText(fire.x, fire.y, 'Найден!', 'hit');
      this.deps.sfx.hitConfirm();
      navigator.vibrate?.([20, 40, 45]);
      this.deps.camera.shake(0.12);
    } else if (result.point) {
      showFloatingText(fire.x, fire.y, 'мимо', 'miss');
    }
  }

  /** Куда полетит капля, пока сервер не ответил: первое препятствие или тело на луче. */
  private predict(fire: FireEvent): THREE.Vector3 {
    this.raycaster.set(fire.origin, fire.direction);
    this.raycaster.far = 40;
    const targets = [...this.deps.world.obstacles, ...this.deps.remotePlayers.meshes()] as THREE.Object3D[];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? hit.point.clone() : fire.origin.clone().addScaledVector(fire.direction, FALLBACK_RANGE);
  }

  private recoil(model: PlayerModel, direction: THREE.Vector3, reloadMs: number) {
    model.fire(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)), reloadMs / 1000);
  }
}

/** Кольцо вокруг места тапа: заполняется за время перезарядки и исчезает — «можно снова». */
function showCooldownRing(x: number, y: number, ms: number) {
  if (ms < 50) return;
  const ring = document.createElement('div');
  ring.className = 'cooldown-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.innerHTML = '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" pathLength="100" /></svg>';
  ring.style.setProperty('--cooldown', `${ms}ms`);
  ring.addEventListener('animationend', (e) => {
    if (e.animationName === 'cooldown-out') ring.remove();
  });
  document.body.append(ring);
}

/** Крестик попадания — привычный сигнал из шутеров: «есть контакт». */
function showHitMarker(x: number, y: number) {
  const marker = document.createElement('div');
  marker.className = 'hit-marker';
  marker.style.left = `${x}px`;
  marker.style.top = `${y}px`;
  marker.addEventListener('animationend', () => marker.remove());
  document.body.append(marker);
}

function showFloatingText(x: number, y: number, text: string, kind: 'hit' | 'miss') {
  const label = document.createElement('div');
  label.className = `float-text ${kind}`;
  label.textContent = text;
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
  label.addEventListener('animationend', () => label.remove());
  document.body.append(label);
}
