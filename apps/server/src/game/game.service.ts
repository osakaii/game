import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { GAME_RULES, seekerCount, type GameResult, type Vec3 } from '@mecha/shared';
import { GameError } from '../common/game-error';
import type { Room, RoomMember } from '../rooms/room';
import { RoomEvents } from '../rooms/room-events';
import { RoomsService } from '../rooms/rooms.service';
import { shuffle } from './shuffle';

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
