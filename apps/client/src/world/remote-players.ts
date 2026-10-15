import * as THREE from 'three';
import {
  INTERPOLATION_DELAY_MS,
  type PlayerInfo,
  type RoomSnapshot,
  type SkinState,
  type WorldSnapshot,
} from '@mecha/shared';
import { RemotePlayer } from '../player/remote-player';
import type { WorldGeometry } from './active-map';

/** Все чужие игроки комнаты: создаёт, обновляет и удаляет их модели по снимкам сервера. */
export class RemotePlayers {
  private readonly players = new Map<string, RemotePlayer>();
  /** Ники, роли и цвета из room:state. Позиции приходят отдельно, в world:snapshot. */
  private infos = new Map<string, PlayerInfo>();
  private isLabelVisible: (id: string) => boolean = () => true;
  /** Идёт раунд — ищущие держат краскомёты. */
  private inGame = false;
  /**
   * Картинки кож, пришедшие по сети. Храним отдельно от моделей: картинка может прийти раньше,
   * чем модель игрока появится (модель создаётся по первому снимку позиций).
   */
  private readonly skinImages = new Map<string, { revision: number; image: ImageBitmap }>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: WorldGeometry,
  ) {}

  applySnapshot(snapshot: WorldSnapshot, myId: string | null): void {
    const present = new Set<string>();
    for (const state of snapshot.players) {
      if (state.id === myId) continue; // себя рисуем сами, без задержки
      present.add(state.id);

      let player = this.players.get(state.id);
      if (!player) {
        player = new RemotePlayer(state.id, this.world);
        this.applyInfo(player);
        this.players.set(state.id, player);
        this.scene.add(player.model.root);
      }
      player.addSample(snapshot.t, state);
    }

    // Кого нет в снимке — тот вышел из комнаты.
    for (const [id, player] of this.players) {
      if (!present.has(id)) {
        player.dispose();
        this.players.delete(id);
      }
    }
  }

  /** Ники и роли приходят в room:state, позиции — в world:snapshot. Склеиваем по id. */
  applyRoom(room: RoomSnapshot | null, myId: string | null): void {
    if (!room) {
      this.infos.clear();
      this.skinImages.clear();
      this.clear();
      return;
    }
    this.infos = new Map(room.players.map((p) => [p.id, p]));

    // Во время раунда видим ники только своей команды.
    const roles = new Map(room.players.map((p) => [p.id, p.role]));
    const myRole = myId ? roles.get(myId) : null;
    const inGame = room.phase === 'hiding' || room.phase === 'seeking';
    this.inGame = inGame;
    this.isLabelVisible = (id) => !inGame || roles.get(id) === myRole;

    for (const player of this.players.values()) this.applyInfo(player);
  }

  private applyInfo(player: RemotePlayer) {
    const info = this.infos.get(player.id);
    player.setNickname(info?.nickname ?? '…');
    if (info) this.applySkin(player, info.skin);
    player.setLabelVisible(this.isLabelVisible(player.id));
    player.model.setArmed(this.inGame && info?.role === 'seeker');
  }

  /** Модель чужого игрока (чтобы показать его выстрел из его краскомёта). */
  get(id: string): RemotePlayer | undefined {
    return this.players.get(id);
  }

  /** Тела чужих игроков — для предсказания, куда полетит своя капля краски. */
  meshes(): THREE.Object3D[] {
    return [...this.players.values()].map((p) => p.model.mesh);
  }

  /** Новая кожа игрока из сети (уже декодированная картинка). */
  setSkinImage(playerId: string, revision: number, image: ImageBitmap): void {
    const known = this.skinImages.get(playerId);
    if (known && known.revision >= revision) return; // опоздавшая старая картинка
    this.skinImages.set(playerId, { revision, image });
    const player = this.players.get(playerId);
    const info = this.infos.get(playerId);
    if (player && info) this.applySkin(player, info.skin);
  }

  /**
   * Что рисовать на модели: основу (картинки нет) или картинку нужной ревизии.
   * Если room:state уже знает о новой картинке, а сама она ещё в пути — ждём её, не мигая основой.
   */
  private applySkin(player: RemotePlayer, skin: SkinState) {
    if (!skin.hasImage) {
      if (player.skinRevision !== skin.revision) {
        player.model.setBase(skin.base);
        player.skinRevision = skin.revision;
        this.skinImages.delete(player.id);
      }
      return;
    }
    const cached = this.skinImages.get(player.id);
    if (cached && cached.revision >= skin.revision && player.skinRevision !== cached.revision) {
      player.model.applySkinImage(cached.image);
      player.skinRevision = cached.revision;
    }
  }

  render(serverNow: number, frameDt: number): void {
    const renderTime = serverNow - INTERPOLATION_DELAY_MS;
    for (const player of this.players.values()) player.render(renderTime, frameDt);
  }

  get count(): number {
    return this.players.size;
  }

  /** Для отладки: где сейчас нарисованы чужие игроки. */
  debugPositions(): Record<string, { x: number; y: number; z: number }> {
    const result: Record<string, { x: number; y: number; z: number }> = {};
    for (const [id, player] of this.players) {
      const { x, y, z } = player.model.root.position;
      result[id] = { x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) };
    }
    return result;
  }

  clear(): void {
    for (const player of this.players.values()) player.dispose();
    this.players.clear();
  }
}
