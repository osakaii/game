import * as THREE from 'three';
import { SEEKER_PAINT } from '../player/blaster';

/** Скорость капли краски (м/с): быстро, но глаз успевает увидеть полёт. */
const BLOB_SPEED = 38;
const MIN_FLIGHT = 0.05;
const MAX_FLIGHT = 0.45;
/** Долетели, а сервер ещё не ответил — ждём столько, потом капля «пшикает» (выстрел не засчитан). */
const CONFIRM_TIMEOUT = 0.6;
const MAX_DROPS = 96;
const GRAVITY = 9;

export interface Impact {
  point: THREE.Vector3;
  hit: boolean;
}

/**
 * Выстрел, который виден на экране. Свой выстрел запускаем сразу по тапу — в точку, куда целились
 * («предсказание»), а сервер потом сообщает, куда краска попала на самом деле: капля доворачивает
 * к настоящей точке. Так отклик мгновенный, а итог — честный, серверный.
 */
export class Shot {
  readonly mesh: THREE.Mesh;
  readonly position = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private elapsed = 0;
  private duration = 0;
  private waiting = 0;
  /** Итог от сервера: куда и попал ли. null — ещё не знаем. */
  result: Impact | 'fizzle' | null = null;
  done = false;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.position.copy(from);
    this.aim(to);
  }

  /** Лететь из текущего места в новую точку (сервер поправил цель). */
  aim(to: THREE.Vector3): void {
    this.from.copy(this.position);
    this.to.copy(to);
    this.elapsed = 0;
    const distance = this.from.distanceTo(this.to);
    this.duration = Math.min(MAX_FLIGHT, Math.max(MIN_FLIGHT, distance / BLOB_SPEED));
  }

  get arrived(): boolean {
    return this.elapsed >= this.duration;
  }

  /** Двигает каплю. Возвращает true, пока она в полёте. */
  step(dt: number): boolean {
    if (this.arrived) {
      this.waiting += dt;
      this.mesh.visible = false;
      return false;
    }
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = this.elapsed / this.duration;
    this.position.lerpVectors(this.from, this.to, t);
    // Лёгкая дуга — капля жидкая и тяжёлая, а не лазерный луч.
    this.position.y += Math.sin(t * Math.PI) * 0.04 * this.from.distanceTo(this.to);
    this.mesh.position.copy(this.position);
    this.mesh.lookAt(this.to);
    return true;
  }

  get timedOut(): boolean {
    return this.waiting > CONFIRM_TIMEOUT;
  }
}

interface Drop {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  age: number;
  life: number;
  color: THREE.Color;
}

/**
 * Всё, что видно при выстреле: вспышка у сопла, летящая капля со следом, брызги при ударе.
 * Брызги — один InstancedMesh (один вызов отрисовки на все капельки): на телефоне это важно.
 */
export class ShotFx {
  private readonly shots: Shot[] = [];
  /** Свои выстрелы, на которые сервер ещё не ответил, — по порядку (сервер отвечает в том же порядке). */
  private readonly pendingOwn: Shot[] = [];
  private readonly blobGeometry = new THREE.SphereGeometry(0.05, 12, 8);
  private readonly blobMaterial = new THREE.MeshBasicMaterial({ color: SEEKER_PAINT });
  private readonly drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly flashes: { sprite: THREE.Sprite; age: number }[] = [];
  private readonly flashMaterial: THREE.SpriteMaterial;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly paint = new THREE.Color(SEEKER_PAINT);
  private readonly gold = new THREE.Color('#ffd166');

  /** Капля долетела и сервер подтвердил — пятно, звук, «найден!». */
  onImpact: ((impact: Impact, shot: Shot) => void) | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      MAX_DROPS,
    );
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false; // капли разлетаются по всей сцене, границы меняются каждый кадр
    scene.add(this.dropMesh);
    this.flashMaterial = new THREE.SpriteMaterial({
      map: createFlashTexture(),
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  /** Свой выстрел: летит сразу в предсказанную точку, итог придёт от сервера (confirmOwn). */
  fireOwn(from: THREE.Vector3, predicted: THREE.Vector3, direction: THREE.Vector3): Shot {
    const shot = this.launch(from, predicted, direction);
    this.pendingOwn.push(shot);
    return shot;
  }

  /** Сервер разослал итог нашего выстрела: доворачиваем самую старую неподтверждённую каплю. */
  confirmOwn(point: THREE.Vector3 | null, hit: boolean): Shot | null {
    const shot = this.pendingOwn.shift();
    if (!shot) return null;
    if (!point) {
      shot.result = 'fizzle';
      return shot;
    }
    shot.result = { point: point.clone(), hit };
    if (!shot.arrived) shot.aim(point);
    return shot;
  }

  /** Сервер отказал (перезарядка, не та фаза) — капля пшикает, пятна не будет. */
  cancelOwn(shot: Shot): void {
    const i = this.pendingOwn.indexOf(shot);
    if (i >= 0) this.pendingOwn.splice(i, 1);
    shot.result = 'fizzle';
  }

  /** Выстрел другого ищущего: итог уже известен, просто показываем полёт. */
  fireRemote(from: THREE.Vector3, point: THREE.Vector3, hit: boolean, direction: THREE.Vector3): Shot {
    const shot = this.launch(from, point, direction);
    shot.result = { point: point.clone(), hit };
    return shot;
  }

  update(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      if (shot.step(dt)) {
        // След: капельки срываются с летящей капли и падают.
        this.spawnDrops(shot.position, 1, 0.4, 0.012, this.paint, 0.35);
        continue;
      }
      if (shot.result === null && !shot.timedOut) continue; // долетели, ждём сервер
      this.finish(shot, i);
    }
    this.updateFlashes(dt);
    this.updateDrops(dt);
  }

  private launch(from: THREE.Vector3, to: THREE.Vector3, direction: THREE.Vector3): Shot {
    const shot = new Shot(this.blobGeometry, this.blobMaterial, from, to);
    shot.mesh.scale.set(1, 1, 2.2); // вытянута по ходу полёта
    this.scene.add(shot.mesh);
    this.shots.push(shot);
    this.flash(from);
    // Брызги из сопла — веером вперёд.
    for (let k = 0; k < 6; k++) {
      const v = direction.clone().multiplyScalar(2 + Math.random() * 2);
      v.x += (Math.random() - 0.5) * 1.5;
      v.y += Math.random() * 1.2;
      v.z += (Math.random() - 0.5) * 1.5;
      this.addDrop(from, v, 0.015 + Math.random() * 0.012, this.paint, 0.3);
    }
    return shot;
  }

  private finish(shot: Shot, index: number) {
    this.shots.splice(index, 1);
    this.scene.remove(shot.mesh);
    shot.done = true;
    const i = this.pendingOwn.indexOf(shot);
    if (i >= 0) this.pendingOwn.splice(i, 1);

    const result = shot.result;
    if (!result || result === 'fizzle') {
      // Не засчитано: маленький «пшик» без пятна.
      this.spawnDrops(shot.position, 5, 1.2, 0.012, this.paint, 0.25);
      return;
    }
    if (result.hit) {
      // Нашли! Золото и краска во все стороны.
      this.spawnDrops(result.point, 18, 3.5, 0.03, this.gold, 0.7);
      this.spawnDrops(result.point, 14, 2.5, 0.025, this.paint, 0.6);
    } else {
      this.spawnDrops(result.point, 8, 1.6, 0.02, this.paint, 0.45);
    }
    this.onImpact?.(result, shot);
  }

  private flash(at: THREE.Vector3) {
    const sprite = new THREE.Sprite(this.flashMaterial);
    sprite.position.copy(at);
    sprite.scale.setScalar(0.01);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    this.flashes.push({ sprite, age: 0 });
  }

  private updateFlashes(dt: number) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      flash.age += dt;
      const t = flash.age / 0.11;
      if (t >= 1) {
        this.scene.remove(flash.sprite);
        this.flashes.splice(i, 1);
        continue;
      }
      // Быстро вспыхнула и раздулась — гаснет за счёт сжатия до нуля во второй половине.
      flash.sprite.scale.setScalar(0.6 * Math.sin(t * Math.PI));
    }
  }

  private spawnDrops(at: THREE.Vector3, count: number, speed: number, size: number, color: THREE.Color, life: number) {
    for (let k = 0; k < count; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.addDrop(at, v, size * (0.6 + Math.random() * 0.8), color, life * (0.7 + Math.random() * 0.6));
    }
  }

  private addDrop(at: THREE.Vector3, velocity: THREE.Vector3, size: number, color: THREE.Color, life: number) {
    // Пул заполнен — заменяем самую старую капельку: брызг много, ни одна не важна.
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push({ position: at.clone(), velocity, size, age: 0, life, color });
  }

  private updateDrops(dt: number) {
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age >= d.life) {
        this.drops.splice(i, 1);
        continue;
      }
      d.velocity.y -= GRAVITY * dt;
      d.position.addScaledVector(d.velocity, dt);
      if (d.position.y < 0.01) {
        d.position.y = 0.01;
        d.velocity.set(0, 0, 0); // упала на пол — лежит и тает
      }
      // Гаснет уменьшением: прозрачность у instanced-капель общая, а размер — свой у каждой.
      this.scale.setScalar(d.size * (1 - d.age / d.life));
      this.matrix.compose(d.position, this.quaternion, this.scale);
      this.dropMesh.setMatrixAt(n, this.matrix);
      this.dropMesh.setColorAt(n, d.color);
      n++;
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;
  }
}

/** Мягкое светлое пятно для вспышки у сопла: радиальный градиент на canvas. */
function createFlashTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,140,190,0.8)');
    g.addColorStop(1, 'rgba(255,61,127,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
