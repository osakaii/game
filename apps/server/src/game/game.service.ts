import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import {
  GAME_RULES,
  PLAYER,
  canPaint,
  canShoot,
  seekerCount,
  type BodyZone,
  type GameResult,
  type ShotResult,
  type Vec3,
} from '@mecha/shared';
import { GameError } from '../common/game-error';
import type { Room, RoomMember } from '../rooms/room';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { resolveShot } from './shot';
import { shuffle } from './shuffle';

/**
 * Минимальный интервал между покрасками (мс). Каждая покраска — рассылка room:state всей комнате,
 * без лимита один клиент в цикле мог бы завалить сервер и всех игроков.
 */
const PAINT_INTERVAL_MS = 50;

/**
 * Луч приходит из камеры клиента, а камера висит за спиной игрока (до ~4.5 м + высота плеч).
 * Дальше этого от игрока луч начинаться не может — иначе «стреляли» бы из другого конца карты.
 */
const SHOT_ORIGIN_MAX_OFFSET = 6;
/** Длина луча от камеры. Дальность от самого ищущего проверяется отдельно (shotRange). */
const SHOT_RAY_LENGTH = 40;

/**
 * Ведёт раунд: раздаёт роли, переключает фазы по таймерам, проверяет условия победы.
 *
 * Room хранит состояние и умеет переходы, GameService решает КОГДА переходить.
 * Наружу сообщает только через RoomEvents — про сокеты ничего не знает.
 */
@Injectable()
export class GameService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  /** Один активный таймер фазы на комнату. Ключ — сам объект Room, а не код (см. schedule). */
  private readonly timers = new Map<Room, ReturnType<typeof setTimeout>>();
  private subscription: Subscription | undefined;

  constructor(
    private readonly rooms: RoomsService,
    private readonly events: RoomEvents,
  ) {}

  onModuleInit() {
    this.subscription = this.events.playerLeft.subscribe((room) => this.checkWinConditions(room));
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  start(room: Room, playerId: string, random: () => number = Math.random): void {
    if (room.hostId !== playerId) throw new GameError('NOT_HOST');
    if (room.phase !== 'lobby') throw new GameError('GAME_IN_PROGRESS');
    if (room.size < GAME_RULES.minPlayers) throw new GameError('NOT_ENOUGH_PLAYERS');

    const ids = shuffle(
      room.allMembers().map((m) => m.id),
      random,
    );
    const seekers = new Set(ids.slice(0, seekerCount(room.size)));
    room.startRound(seekers, Date.now() + GAME_RULES.hideSeconds * 1000);

    for (const member of room.allMembers()) {
      const points = member.role === 'seeker' ? room.map.seekerSpawns : room.map.spawns;
      this.teleport(room, member, room.nextSpawn(points));
    }
    this.logger.log(`room ${room.code}: round started, seekers: ${[...seekers].length}/${room.size}`);
    this.events.changed.next(room);

    this.schedule(room, GAME_RULES.hideSeconds, () => this.startSeeking(room));
  }

  paint(room: Room, playerId: string, zones: readonly BodyZone[], color: string, now = Date.now()): void {
    const member = room.member(playerId);
    if (!member) throw new GameError('ROOM_NOT_FOUND');
    if (!canPaint(room.phase, member.role)) throw new GameError('PAINT_NOT_ALLOWED');
    if (now - member.paintedAt < PAINT_INTERVAL_MS) throw new GameError('RATE_LIMITED');

    room.paint(member, zones, color, now);
    this.events.changed.next(room);
  }

  /**
   * Проверка места ищущим. Клиент присылает только луч — что в него попало, решает сервер
   * по своим позициям и своей карте.
   */
  shoot(room: Room, playerId: string, origin: Vec3, rawDir: Vec3, now = Date.now()): ShotResult {
    const seeker = room.member(playerId);
    if (!seeker) throw new GameError('ROOM_NOT_FOUND');
    if (!canShoot(room.phase, seeker.role)) throw new GameError('SHOT_NOT_ALLOWED');
    if (now < seeker.nextShotAt) throw new GameError('RATE_LIMITED');

    const length = Math.hypot(rawDir.x, rawDir.y, rawDir.z);
    if (length < 0.5 || length > 1.5) throw new GameError('INVALID_INPUT', 'direction must be normalized');
    const dir = { x: rawDir.x / length, y: rawDir.y / length, z: rawDir.z / length };

    const p = seeker.state;
    const eyeY = p.y + PLAYER.height * 0.8;
    if (Math.hypot(origin.x - p.x, origin.y - eyeY, origin.z - p.z) > SHOT_ORIGIN_MAX_OFFSET) {
      throw new GameError('INVALID_INPUT', 'shot origin too far from seeker');
    }

    const targets = room.activeHiders().map((m) => ({ id: m.id, position: m.state }));
    const hit = resolveShot(origin, dir, room.colliders, targets, SHOT_RAY_LENGTH);

    let point = hit
      ? { x: origin.x + dir.x * hit.t, y: origin.y + dir.y * hit.t, z: origin.z + dir.z * hit.t }
      : null;
    let hitPlayerId = hit?.playerId ?? null;
    if (point && Math.hypot(point.x - p.x, point.y - p.y, point.z - p.z) > GAME_RULES.shotRange) {
      point = null; // слишком далеко — проверка не засчитывается, но задержка за промах есть
      hitPlayerId = null;
    }

    seeker.nextShotAt = now + (hitPlayerId ? GAME_RULES.shotCooldownHitMs : GAME_RULES.shotCooldownMissMs);
    this.events.shot.next({ room, shot: { seekerId: seeker.id, hitPlayerId, point } });

    if (hitPlayerId) {
      const hider = room.member(hitPlayerId)!;
      room.markFound(hider);
      this.logger.log(`room ${room.code}: ${seeker.nickname} found ${hider.nickname}`);
      this.events.changed.next(room);
      this.checkWinConditions(room);
    }
    return { hitPlayerId, point, nextShotAt: seeker.nextShotAt };
  }

  /**
   * Проверка конца раунда. Вызывается, когда кто-то вышел, а на этапе 6 — когда кого-то нашли.
   */
  checkWinConditions(room: Room): void {
    if (!room.inGame) return;

    if (room.countActive('seeker') === 0) {
      this.finish(room, { winner: 'hider', reason: 'seekers_left' });
    } else if (room.countActive('hider') === 0) {
      // Прячущихся не осталось: либо всех нашли, либо они вышли из игры.
      const anyFound = room.allMembers().some((m) => m.role === 'hider' && m.found);
      this.finish(room, { winner: 'seeker', reason: anyFound ? 'all_found' : 'hiders_left' });
    }
  }

  private startSeeking(room: Room) {
    room.startSeeking(Date.now() + GAME_RULES.seekSeconds * 1000);
    this.events.changed.next(room);
    // Время вышло, а прячущиеся остались — они победили.
    this.schedule(room, GAME_RULES.seekSeconds, () => this.finish(room, { winner: 'hider', reason: 'time_up' }));
  }

  private finish(room: Room, result: GameResult) {
    room.finishRound(result, Date.now() + GAME_RULES.resultsSeconds * 1000);
    this.logger.log(`room ${room.code}: ${result.winner} won (${result.reason})`);
    this.events.changed.next(room);
    this.schedule(room, GAME_RULES.resultsSeconds, () => this.backToLobby(room));
  }

  private backToLobby(room: Room) {
    room.resetToLobby();
    for (const member of room.allMembers()) {
      this.teleport(room, member, room.nextSpawn(room.map.spawns));
    }
    this.events.changed.next(room);
  }

  private teleport(room: Room, member: RoomMember, point: Vec3) {
    room.teleport(member, point);
    this.events.teleported.next({ playerId: member.id, position: { x: point.x, y: point.y, z: point.z } });
  }

  /**
   * Запланировать следующий переход. Старый таймер комнаты отменяется:
   * например, раунд закончился досрочно, и таймер «время вышло» уже не нужен.
   *
   * Комната могла опустеть и удалиться, пока таймер ждал, а под тем же кодом —
   * появиться новая. Поэтому проверяем, что в реестре лежит ТОТ ЖЕ объект Room.
   */
  private schedule(room: Room, seconds: number, transition: () => void) {
    clearTimeout(this.timers.get(room));
    const timer = setTimeout(() => {
      this.timers.delete(room);
      if (this.rooms.get(room.code) !== room) return;
      transition();
    }, seconds * 1000);
    this.timers.set(room, timer);
  }
}
