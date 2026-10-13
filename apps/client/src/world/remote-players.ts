import * as THREE from 'three';
import { INTERPOLATION_DELAY_MS, type Aabb, type RoomSnapshot, type WorldSnapshot } from '@mecha/shared';
import { RemotePlayer } from '../player/remote-player';

/** Все чужие игроки комнаты: создаёт, обновляет и удаляет их модели по снимкам сервера. */
export class RemotePlayers {
  private readonly players = new Map<string, RemotePlayer>();
  private nicknames = new Map<string, string>();
  private isLabelVisible: (id: string) => boolean = () => true;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly colliders: Aabb[],
  ) {}

  applySnapshot(snapshot: WorldSnapshot, myId: string | null): void {
    const present = new Set<string>();
    for (const state of snapshot.players) {
      if (state.id === myId) continue; // себя рисуем сами, без задержки
      present.add(state.id);

      let player = this.players.get(state.id);
      if (!player) {
        player = new RemotePlayer(state.id, this.colliders);
        player.setNickname(this.nicknames.get(state.id) ?? '…');
        player.setLabelVisible(this.isLabelVisible(state.id));
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
      this.nicknames.clear();
      this.clear();
      return;
    }
    this.nicknames = new Map(room.players.map((p) => [p.id, p.nickname]));

    // Во время раунда видим ники только своей команды.
    const roles = new Map(room.players.map((p) => [p.id, p.role]));
    const myRole = myId ? roles.get(myId) : null;
    const inGame = room.phase === 'hiding' || room.phase === 'seeking';
    this.isLabelVisible = (id) => !inGame || roles.get(id) === myRole;

    for (const [id, player] of this.players) {
      const nickname = this.nicknames.get(id);
      if (nickname) player.setNickname(nickname);
      player.setLabelVisible(this.isLabelVisible(id));
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
