import * as THREE from 'three';
import { BODY_ZONES, DEFAULT_BODY_COLOR, type BodyColors, type BodyZone } from '@mecha/shared';

/**
 * Визуальная модель персонажа из примитивов. Логики и физики здесь нет — только меши и анимация.
 *
 * Конечности висят на «шарнирах» (pivot-группах): pivot стоит в плече/бедре,
 * меш смещён вниз. Вращаем pivot — конечность качается вокруг сустава, а не вокруг своего центра.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  readonly zones = {} as Record<BodyZone, THREE.Mesh>;

  private readonly legLeft = new THREE.Group();
  private readonly legRight = new THREE.Group();
  private readonly armLeft = new THREE.Group();
  private readonly armRight = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private walkPhase = 0;

  constructor() {
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

    // Пропорции: ноги 0–0.6, торс 0.6–1.16, голова 1.18–1.6 (рост = PLAYER.height).
    this.addLimb('legLeft', this.legLeft, box(0.22, 0.6, 0.24), -0.13, 0.6);
    this.addLimb('legRight', this.legRight, box(0.22, 0.6, 0.24), 0.13, 0.6);
    this.addLimb('armLeft', this.armLeft, box(0.18, 0.5, 0.2), -0.38, 1.12);
    this.addLimb('armRight', this.armRight, box(0.18, 0.5, 0.2), 0.38, 1.12);

    const torso = this.createZone('torso', box(0.56, 0.56, 0.32));
    torso.position.y = 0.88;
    this.root.add(torso);

    const head = this.createZone('head', box(0.42, 0.42, 0.42));
    head.position.y = 1.39;
    this.root.add(head);

    // Глаза показывают, куда смотрит персонаж (+Z — «вперёд» модели). Они не красятся.
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#1b1f2a' });
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(box(0.07, 0.1, 0.02), eyeMaterial);
      eye.position.set(x, 0.03, 0.215);
      head.add(eye);
    }

    // Круглая «тень» — дешёвая замена настоящим теням, помогает понять высоту прыжка.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);
  }

  setZoneColor(zone: BodyZone, color: string): void {
    this.material(zone).color.set(color);
  }

  setColors(colors: BodyColors): void {
    for (const zone of BODY_ZONES) this.setZoneColor(zone, colors[zone]);
  }

  /**
   * Призрак — найденный прячущийся: полупрозрачный, наблюдает за раундом.
   * Смена transparent требует needsUpdate: three.js пересоберёт шейдер материала.
   */
  setGhost(ghost: boolean): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object === this.shadow) return;
      const material = object.material as THREE.Material;
      if (material.transparent === ghost) return;
      material.transparent = ghost;
      material.opacity = ghost ? 0.3 : 1;
      material.depthWrite = !ghost;
      material.needsUpdate = true;
    });
    this.shadow.visible = !ghost;
  }

  /** Текущий цвет зоны как #rrggbb — то, что сейчас видно на экране. */
  colorOf(zone: BodyZone): string {
    return `#${this.material(zone).color.getHexString()}`;
  }

  private material(zone: BodyZone): THREE.MeshLambertMaterial {
    return this.zones[zone].material as THREE.MeshLambertMaterial;
  }

  /** Тень лежит на опоре под персонажем, а не у ног (в прыжке она остаётся внизу). */
  setShadowGround(groundY: number): void {
    this.shadow.position.y = groundY - this.root.position.y + 0.01;
  }

  /** speed01 — горизонтальная скорость 0..1 от максимальной. */
  animate(dt: number, speed01: number, grounded: boolean): void {
    if (!grounded) {
      // В прыжке поджимаем ноги и поднимаем руки.
      this.legLeft.rotation.x = this.legRight.rotation.x = -0.5;
      this.armLeft.rotation.x = this.armRight.rotation.x = -2.4;
      return;
    }
    this.walkPhase += dt * (4 + 8 * speed01);
    const swing = Math.sin(this.walkPhase) * 0.7 * speed01;
    this.legLeft.rotation.x = swing;
    this.legRight.rotation.x = -swing;
    this.armLeft.rotation.x = -swing;
    this.armRight.rotation.x = swing;
  }

  private createZone(zone: BodyZone, geometry: THREE.BufferGeometry): THREE.Mesh {
    // Каждой зоне свой материал — чтобы потом красить её независимо.
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: DEFAULT_BODY_COLOR }));
    mesh.name = zone;
    this.zones[zone] = mesh;
    return mesh;
  }

  private addLimb(zone: BodyZone, pivot: THREE.Group, geometry: THREE.BoxGeometry, x: number, jointY: number) {
    const mesh = this.createZone(zone, geometry);
    const length = geometry.parameters.height;
    mesh.position.y = -length / 2;
    pivot.position.set(x, jointY, 0);
    pivot.add(mesh);
    this.root.add(pivot);
  }
}
