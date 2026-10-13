import {
  MAX_PLAYERS,
  PLAYROOM,
  buildColliders,
  type Aabb,
  type LobbyPlayer,
  type MapDef,
  type NetPlayer,
  type PlayerState,
  type RoomPhase,
  type RoomSnapshot,
} from '@mecha/shared';

/** Игрок внутри комнаты: публичные данные + последнее принятое сервером состояние. */
export interface RoomMember extends LobbyPlayer {
  state: PlayerState;
  /** Серверное время (мс), когда state последний раз был принят. */
  stateAt: number;
}

/**
 * Комната — чистая доменная модель: ни сокетов, ни Nest.
 * Её легко тестировать и легко читать.
 */
export class Room {
  /** Map сохраняет порядок вставки — первый в списке = зашёл раньше всех. */
  private readonly members = new Map<string, RoomMember>();
  private _hostId = '';
  private spawnCursor = 0;
  phase: RoomPhase = 'lobby';
  readonly colliders: Aabb[];

  constructor(
    readonly code: string,
    readonly map: MapDef = PLAYROOM,
    readonly maxPlayers = MAX_PLAYERS,
  ) {
    this.colliders = buildColliders(map);
  }

  get hostId(): string {
    return this._hostId;
  }

  get size(): number {
    return this.members.size;
  }

  get isFull(): boolean {
    return this.members.size >= this.maxPlayers;
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  has(playerId: string): boolean {
    return this.members.has(playerId);
  }

  member(playerId: string): RoomMember | undefined {
    return this.members.get(playerId);
  }

  addPlayer(id: string, nickname: string, now = Date.now()): RoomMember {
    // Спавны по кругу, чтобы новые игроки не появлялись друг в друге.
    const spawn = this.map.spawns[this.spawnCursor++ % this.map.spawns.length];
    const member: RoomMember = {
      id,
      nickname: this.uniqueNickname(nickname),
      state: { x: spawn.x, y: spawn.y, z: spawn.z, yaw: Math.PI, grounded: true },
      stateAt: now,
    };
    this.members.set(id, member);
    if (!this._hostId) this._hostId = id;
    return member;
  }

  removePlayer(id: string): void {
    this.members.delete(id);
    if (id === this._hostId) {
      // Хост ушёл — хостом становится тот, кто дольше всех в комнате.
      const next = this.members.keys().next();
      this._hostId = next.done ? '' : next.value;
    }
  }

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      hostId: this._hostId,
      maxPlayers: this.maxPlayers,
      phase: this.phase,
      players: [...this.members.values()].map(({ id, nickname }) => ({ id, nickname })),
    };
  }

  netPlayers(): NetPlayer[] {
    return [...this.members.values()].map(({ id, state }) => ({ id, ...state }));
  }

  /** Два «Алекса» в одной комнате путают всех — второй станет «Алекс 2». */
  private uniqueNickname(nickname: string): string {
    const taken = new Set([...this.members.values()].map((p) => p.nickname));
    if (!taken.has(nickname)) return nickname;
    for (let n = 2; ; n++) {
      const candidate = `${nickname} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
