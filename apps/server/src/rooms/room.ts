import {
  DEFAULT_DAYTIME,
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  SCORING,
  buildColliders,
  gazePoints,
  patchSettings,
  pickDaytime,
  type Aabb,
  type Daytime,
  type GameResult,
  type GazeUpdate,
  type MapDef,
  type NetPlayer,
  type PlayerInfo,
  type PlayerState,
  type Role,
  type RoomPhase,
  type RoomSettings,
  type RoomSnapshot,
  type SkinBase,
  type StaminaState,
  type Vec3,
} from '@mecha/shared';
// Все карты сразу: серверу нужна любая, какую выберет хост (браузер грузит только свою).
import { MAPS } from '@mecha/shared/maps';

import type { AirState } from '../movement/air-check';
import { freshBudget, type MoveBudget } from '../movement/move-validator';
import { PositionHistory } from '../movement/position-history';

/** Игрок внутри комнаты: публичные данные + последнее принятое сервером состояние. */
// Omit: в room:state уходит лёгкое SkinState без картинки, а на сервере кожа хранит и саму картинку.
export interface RoomMember extends Omit<PlayerInfo, 'skin' | 'gazePoints'> {
  state: PlayerState;
  /** Серверное время (мс), когда state последний раз был принят. */
  stateAt: number;
  /** Кожа: основа + последняя загруженная картинка (как прислал клиент, сжатая). */
  skin: { base: SkinBase; revision: number; image: Buffer | null; uploadedAt: number };
  /** Когда ищущий может проверять снова (серверное время, мс). */
  nextShotAt: number;
  score: number;
  roundPoints: number;
  /** Сколько раундов был ищущим — для честной очереди ведущих. */
  timesSeeker: number;
  /** Сколько в воздухе и откуда оторвался — защита от «полётов». */
  air: AirState;
  /** Выносливость по версии сервера: бег клиента принимается, только пока она не кончилась. */
  stamina: StaminaState;
  /** Сколько метров игрок ещё вправе пройти (античит скорости, см. move-validator). */
  moveBudget: MoveBudget;
  /** Недавние позиции — для компенсации задержки при проверке мест. */
  history: PositionHistory;
  /** Сколько мс за раунд на прячущегося смотрел ищущий (очки за взгляд, gaze.ts). */
  watchedMs: number;
  /**
   * Смотрят ли на него прямо сейчас — шлём событие только при смене. null — что знает клиент, неизвестно
   * (переподключился, мог перезагрузить страницу): следующий тик пришлёт состояние в любом случае.
   */
  watched: boolean | null;
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
  round = 0;
  /** Свет и небо раунда: новое время суток на каждый раунд (у всех одно — маскировка выглядит одинаково). */
  daytime: Daytime = DEFAULT_DAYTIME;
  /** Когда начался текущий раунд — длительность для статистики. */
  roundStartedAt = 0;
  private _settings: RoomSettings = { ...DEFAULT_SETTINGS };
  private _map: MapDef;
  private _colliders: Aabb[];

  constructor(
    readonly code: string,
    readonly maxPlayers = MAX_PLAYERS,
  ) {
    this._map = MAPS[this._settings.mapId];
    this._colliders = buildColliders(this._map);
  }

  get settings(): RoomSettings {
    return this._settings;
  }

  get map(): MapDef {
    return this._map;
  }

  get colliders(): Aabb[] {
    return this._colliders;
  }

  /** Возвращает true, если сменилась карта — тогда всех нужно переставить на новые точки. */
  applySettings(patch: Partial<RoomSettings>): boolean {
    const mapChanged = patch.mapId !== undefined && patch.mapId !== this._settings.mapId;
    this._settings = patchSettings(this._settings, patch);
    if (mapChanged) {
      this._map = MAPS[this._settings.mapId];
      this._colliders = buildColliders(this._map);
    }
    return mapChanged;
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

  /**
   * Сколько игроков роли ещё «в игре». Прячущиеся — только не найденные.
   * Ищущие — все, включая помощников (найденных, перешедших в команду ищущих).
   */
  countActive(role: Role): number {
    let count = 0;
    for (const m of this.members.values()) {
      if (m.role !== role) continue;
      if (role === 'hider' && m.found) continue;
      count++;
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
      skin: { base: 'default', revision: 0, image: null, uploadedAt: 0 },
      nextShotAt: 0,
      connected: true,
      score: 0,
      roundPoints: 0,
      timesSeeker: 0,
      air: { since: null, takeoffY: spawn.y },
      stamina: {},
      moveBudget: freshBudget(),
      history: new PositionHistory(),
      watchedMs: 0,
      watched: false,
      state: { x: spawn.x, y: spawn.y, z: spawn.z, yaw: Math.PI, grounded: true, crouching: false, pose: 'none', climbing: false, sprinting: false },
      stateAt: now,
    };
    member.history.push(now, member.state);
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

  startRound(seekerIds: ReadonlySet<string>, hidingEndsAt: number, now = Date.now(), random = Math.random): void {
    this.round++;
    this.daytime = pickDaytime(this.daytime, random);
    this.roundStartedAt = now;
    for (const m of this.members.values()) {
      m.role = seekerIds.has(m.id) ? 'seeker' : 'hider';
      if (m.role === 'seeker') m.timesSeeker++;
      m.found = false;
      m.nextShotAt = 0;
      m.roundPoints = 0;
      m.watchedMs = 0;
      m.watched = false;
      // Раскраска из лобби не переносится в раунд: все прячутся с нуля за отведённое время.
      this.resetSkin(m, m.role === 'seeker' ? 'seeker' : 'default');
    }
    this.result = null;
    this.setPhase('hiding', hidingEndsAt);
  }

  startSeeking(endsAt: number): void {
    this.setPhase('seeking', endsAt);
  }

  /**
   * Конец раунда: дожившие прячущиеся получают очки, всё набранное за раунд идёт в общий счёт.
   * Очки за взгляд — и найденным: их заработали, пока прятались (до итогов они скрыты, см. toSnapshot).
   */
  finishRound(result: GameResult, resultsEndAt: number): void {
    for (const m of this.members.values()) {
      if (m.role === 'hider' && !m.found) m.roundPoints += SCORING.hiderSurvived;
      m.roundPoints += gazePoints(m.watchedMs);
      m.score += m.roundPoints;
    }
    this.result = result;
    this.setPhase('results', resultsEndAt);
  }

  resetToLobby(): void {
    for (const m of this.members.values()) {
      m.role = null;
      m.found = false;
      this.resetSkin(m, 'default');
    }
    this.result = null;
    this.setPhase('lobby', null);
  }

  setConnected(member: RoomMember, connected: boolean): void {
    member.connected = connected;
    if (connected) member.watched = null;
  }

  /**
   * Прячущегося нашли. В режиме helper он переходит в команду ищущих (форма, право проверять),
   * в режиме ghost — становится невидимым наблюдателем.
   */
  markFound(member: RoomMember, by: RoomMember): void {
    member.found = true;
    by.roundPoints += SCORING.seekerFind;
    if (this._settings.foundMode === 'helper') {
      member.role = 'seeker';
      this.resetSkin(member, 'seeker');
    }
  }

  /**
   * Тик очков за взгляд: смотрел ли сейчас на прячущегося кто-то из ищущих (сколько их — неважно).
   * Возвращает, что сообщить самому прячущемуся, или null, если для него ничего не изменилось.
   */
  watch(member: RoomMember, watched: boolean, ms: number): GazeUpdate | null {
    const before = gazePoints(member.watchedMs);
    if (watched) member.watchedMs += ms;
    const points = gazePoints(member.watchedMs);
    if (watched === member.watched && points === before) return null;
    member.watched = watched;
    return { watched, points };
  }

  /** Призрак — найденный в режиме ghost. Его не видно другим. */
  isGhost(member: RoomMember): boolean {
    return member.found && member.role === 'hider';
  }

  /** Прячущиеся, которых ещё не нашли, — по ним проверяются выстрелы. */
  activeHiders(): RoomMember[] {
    return this.allMembers().filter((m) => m.role === 'hider' && !m.found);
  }

  /** Вернуть кожу к основе (без картинки). Ревизия растёт — клиенты поймут, что старая картинка неактуальна. */
  resetSkin(member: RoomMember, base: SkinBase): void {
    member.skin = { base, revision: member.skin.revision + 1, image: null, uploadedAt: member.skin.uploadedAt };
  }

  setSkinImage(member: RoomMember, image: Buffer, now = Date.now()): void {
    member.skin = { ...member.skin, revision: member.skin.revision + 1, image, uploadedAt: now };
  }

  /**
   * Переставить игрока. Обновляем и state: иначе валидатор движения сравнит
   * следующий пакет клиента со СТАРОЙ позицией и решит, что это телепорт-чит.
   */
  teleport(member: RoomMember, position: Vec3, now = Date.now()): void {
    member.state = { ...member.state, x: position.x, y: position.y, z: position.z };
    member.stateAt = now;
    member.air = { since: null, takeoffY: position.y };
    member.moveBudget = freshBudget();
    // Старая история относится к другому месту — перемотка не должна «вернуть» игрока туда.
    member.history.clear();
    member.history.push(now, member.state);
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
      settings: { ...this._settings },
      round: this.round,
      daytime: this.daytime,
      players: this.allMembers().map(({ id, nickname, role, found, skin, connected, score, roundPoints, watchedMs }) => ({
        id,
        nickname,
        role,
        found,
        skin: { base: skin.base, revision: skin.revision, hasImage: skin.image !== null },
        connected,
        score,
        roundPoints,
        // До итогов — 0 для всех: растущие очки подсказали бы ищущему, что он смотрит прямо на прячущегося.
        gazePoints: this.phase === 'results' ? gazePoints(watchedMs) : 0,
      })),
    };
  }

  /** Призраки другим не видны, поэтому в снимки не попадают. Помощники ищущих — видны. */
  netPlayers(): NetPlayer[] {
    return this.allMembers()
      .filter((m) => !this.isGhost(m))
      // Взгляд ищущего — только для очков на сервере, другим игрокам его не рассылаем.
      .map(({ id, state: { look: _look, ...state } }) => ({ id, ...state }));
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
