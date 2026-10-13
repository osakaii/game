/**
 * Правила раунда. Общие для клиента и сервера: сервер по ним считает,
 * клиент — показывает (например, «нужно минимум 2 игрока»).
 */
export const GAME_RULES = {
  minPlayers: 2,
  hideSeconds: 40,
  seekSeconds: 150,
  resultsSeconds: 8,
  /** Насколько далеко от ищущего (м) засчитывается проверка. */
  shotRange: 14,
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
export type RoomPhase = 'lobby' | 'hiding' | 'seeking' | 'results';
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
