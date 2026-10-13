import {
  MAX_PLAYERS,
  PLAYROOM,
  buildColliders,
  defaultBodyColors,
  seekerBodyColors,
  type BodyZone,
  type Aabb,
  type GameResult,
  type MapDef,
  type NetPlayer,
  type PlayerInfo,
  type PlayerState,
  type Role,
  type RoomPhase,
  type RoomSnapshot,
  type Vec3,
} from '@mecha/shared';

/** Игрок внутри комнаты: публичные данные + последнее принятое сервером состояние. */
export interface RoomMember extends PlayerInfo {
  state: PlayerState;
  /** Серверное время (мс), когда state последний раз был принят. */
  stateAt: number;
  /** Когда игрок последний раз красился — для ограничения частоты. */
  paintedAt: number;
  /** Когда ищущий может проверять снова (серверное время, мс). */
  nextShotAt: number;
}

/**
 * Комната — чистая доменная модель: ни сокетов, ни Nest, ни таймеров.
 * Она знает правила «что можно», а «когда» решает GameService.
 */
export class Room {
  /** Map сохраняет порядок вставки — первый в списке = зашёл раньше всех. */
  private readonly members = new Map<string, RoomMember>();
  private _hostId = '';
  private spawnCursor = 0;

  phase: RoomPhase = 'lobby';
  phaseEndsAt: number | null = null;
  result: GameResult | null = null;
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

  get inGame(): boolean {
    return this.phase === 'hiding' || this.phase === 'seeking';
  }

  has(playerId: string): boolean {
    return this.members.has(playerId);
  }

  member(playerId: string): RoomMember | undefined {
    return this.members.get(playerId);
  }

  allMembers(): RoomMember[] {
    return [...this.members.values()];
  }

  /** Сколько игроков роли ещё «в игре»: ищущие — все, прячущиеся — не найденные. */
  countActive(role: Role): number {
    let count = 0;
    for (const m of this.members.values()) {
      if (m.role === role && !m.found) count++;
    }
    return count;
  }

  addPlayer(id: string, nickname: string, now = Date.now()): RoomMember {
    const spawn = this.nextSpawn(this.map.spawns);
    const member: RoomMember = {
      id,
      nickname: this.uniqueNickname(nickname),
      role: null,
      found: false,
      colors: defaultBodyColors(),
      paintedAt: 0,
      nextShotAt: 0,
      connected: true,
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

  // ---------- Переходы между фазами ----------

  startRound(seekerIds: ReadonlySet<string>, hidingEndsAt: number): void {
    for (const m of this.members.values()) {
      m.role = seekerIds.has(m.id) ? 'seeker' : 'hider';
      m.found = false;
      m.nextShotAt = 0;
      // Раскраска из лобби не переносится в раунд: все прячутся с нуля за отведённое время.
      m.colors = m.role === 'seeker' ? seekerBodyColors() : defaultBodyColors();
    }
    this.result = null;
    this.setPhase('hiding', hidingEndsAt);
  }

  startSeeking(endsAt: number): void {
    this.setPhase('seeking', endsAt);
  }

  finishRound(result: GameResult, resultsEndAt: number): void {
    this.result = result;
    this.setPhase('results', resultsEndAt);
  }

  resetToLobby(): void {
    for (const m of this.members.values()) {
      m.role = null;
      m.found = false;
      m.colors = defaultBodyColors();
    }
    this.result = null;
    this.setPhase('lobby', null);
  }

  setConnected(member: RoomMember, connected: boolean): void {
    member.connected = connected;
  }

  markFound(member: RoomMember): void {
    member.found = true;
  }

  /** Прячущиеся, которых ещё не нашли, — по ним проверяются выстрелы. */
  activeHiders(): RoomMember[] {
    return this.allMembers().filter((m) => m.role === 'hider' && !m.found);
  }

  paint(member: RoomMember, zones: readonly BodyZone[], color: string, now = Date.now()): void {
    for (const zone of zones) member.colors[zone] = color;
    member.paintedAt = now;
  }

  /**
   * Переставить игрока. Обновляем и state: иначе валидатор движения сравнит
   * следующий пакет клиента со СТАРОЙ позицией и решит, что это телепорт-чит.
   */
  teleport(member: RoomMember, position: Vec3, now = Date.now()): void {
    member.state = { ...member.state, x: position.x, y: position.y, z: position.z };
    member.stateAt = now;
  }

  /** Точка появления: по кругу из списка, чтобы игроки не появлялись друг в друге. */
  nextSpawn(points: Vec3[]): Vec3 {
    return points[this.spawnCursor++ % points.length];
  }

  // ---------- Снимки для клиентов ----------

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      hostId: this._hostId,
      maxPlayers: this.maxPlayers,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      result: this.result,
      players: this.allMembers().map(({ id, nickname, role, found, colors, connected }) => ({
        id,
        nickname,
        role,
        found,
        colors: { ...colors },
        connected,
      })),
    };
  }

  /** Найденные — призраки: другим их не видно, поэтому в снимки не попадают. */
  netPlayers(): NetPlayer[] {
    return this.allMembers()
      .filter((m) => !m.found)
      .map(({ id, state }) => ({ id, ...state }));
  }

  private setPhase(phase: RoomPhase, endsAt: number | null) {
    this.phase = phase;
    this.phaseEndsAt = endsAt;
  }

  /** Два «Алекса» в одной комнате путают всех — второй станет «Алекс 2». */
  private uniqueNickname(nickname: string): string {
    const taken = new Set(this.allMembers().map((p) => p.nickname));
    if (!taken.has(nickname)) return nickname;
    for (let n = 2; ; n++) {
      const candidate = `${nickname} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
