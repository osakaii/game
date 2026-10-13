import { MAX_PLAYERS, type LobbyPlayer, type RoomPhase, type RoomSnapshot } from '@mecha/shared';

/**
 * Комната — чистая доменная модель: ни сокетов, ни Nest.
 * Её легко тестировать и легко читать.
 */
export class Room {
  /** Map сохраняет порядок вставки — первый в списке = зашёл раньше всех. */
  private readonly players = new Map<string, LobbyPlayer>();
  private _hostId = '';
  phase: RoomPhase = 'lobby';

  constructor(
    readonly code: string,
    readonly maxPlayers = MAX_PLAYERS,
  ) {}

  get hostId(): string {
    return this._hostId;
  }

  get size(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  has(playerId: string): boolean {
    return this.players.has(playerId);
  }

  addPlayer(id: string, nickname: string): LobbyPlayer {
    const player = { id, nickname: this.uniqueNickname(nickname) };
    this.players.set(id, player);
    if (!this._hostId) this._hostId = id;
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    if (id === this._hostId) {
      // Хост ушёл — хостом становится тот, кто дольше всех в комнате.
      const next = this.players.keys().next();
      this._hostId = next.done ? '' : next.value;
    }
  }

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      hostId: this._hostId,
      maxPlayers: this.maxPlayers,
      phase: this.phase,
      players: [...this.players.values()],
    };
  }

  /** Два «Алекса» в одной комнате путают всех — второй станет «Алекс 2». */
  private uniqueNickname(nickname: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.nickname));
    if (!taken.has(nickname)) return nickname;
    for (let n = 2; ; n++) {
      const candidate = `${nickname} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
