/**
 * Правила раунда. Общие для клиента и сервера: сервер по ним считает,
 * клиент — показывает (например, «нужно минимум 2 игрока»).
 */
export const GAME_RULES = {
  minPlayers: 2,
  // Длительности пряток и поиска — в настройках комнаты (settings.ts), их выбирает хост.
  resultsSeconds: 10,
  /** Насколько далеко от ищущего (м) засчитывается проверка. */
  // Квартира большая (×3): с 14 м приходилось подбегать почти вплотную через всю комнату.
  shotRange: 30,
  /** Задержка после попадания и после промаха (мс). Промах дороже — иначе выгодно тыкать во всё подряд. */
  shotCooldownHitMs: 500,
  shotCooldownMissMs: 1500,
} as const;

/**
 * Фазы комнаты — конечный автомат (state machine):
 *
 *   lobby ──start (хост)──► hiding ──таймер──► seeking ──таймер / все найдены──► results ──таймер──► lobby
 *                             │                   │
 *                             └── одна из команд опустела ──► results
 */
/** Массив, а не только тип: по нему zod проверяет фазу в сообщениях (телеметрия). */
export const ROOM_PHASES = ['lobby', 'hiding', 'seeking', 'results'] as const;
export type RoomPhase = (typeof ROOM_PHASES)[number];
export type Role = 'hider' | 'seeker';

export type WinReason = 'time_up' | 'all_found' | 'seekers_left' | 'hiders_left';

export interface GameResult {
  winner: Role;
  reason: WinReason;
}

/** 2–5 игроков — 1 ищущий, 6–8 — 2. */
export function seekerCount(players: number): number {
  return Math.max(1, Math.round(players / 4));
}

/** Сколько ищущих в раунде с учётом настройки. Хотя бы один прячущийся должен остаться. */
export function resolveSeekerCount(players: number, setting: 'auto' | number): number {
  const wanted = setting === 'auto' ? seekerCount(players) : setting;
  return Math.max(1, Math.min(wanted, players - 1));
}

/**
 * Можно ли краситься. В лобби — всем (потренироваться), в прятках — только прячущимся.
 * Во время поиска нельзя: перекрашивание на глазах у ищущего было бы слишком сильным.
 */
export function canPaint(phase: RoomPhase, role: Role | null): boolean {
  return phase === 'lobby' || (phase === 'hiding' && role === 'hider');
}

export function canShoot(phase: RoomPhase, role: Role | null): boolean {
  return phase === 'seeking' && role === 'seeker';
}

/** Может ли игрок двигаться в этой фазе. Ищущие ждут с закрытыми глазами, пока все прячутся. */
export function canMove(phase: RoomPhase, role: Role | null): boolean {
  return !(phase === 'hiding' && role === 'seeker');
}
