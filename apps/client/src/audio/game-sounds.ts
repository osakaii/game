import type { HintPing, Role, RoomSnapshot, ShotEvent, Vec3 } from '@mecha/shared';
import type { Sfx } from './sfx';

const TICK_FROM_SECONDS = 5;
/** Дальше этого расстояния (м) шлепок едва слышен. */
const HEARING_DISTANCE = 20;
/** Свист подсказки слышно через всю площадь (180 м), но тише с расстоянием. */
const WHISTLE_DISTANCE = 150;
const WHISTLE_MIN_VOLUME = 0.15;
/** Не до упора в одно ухо: в наушниках жёсткая панорама неприятна. */
const MAX_PAN = 0.85;

/** Где слушатель (камера) и куда смотрит его «правое ухо» — по горизонтали. */
export interface Listener {
  position: Vec3;
  rightX: number;
  rightZ: number;
}

/**
 * Объёмность без PannerNode: громкость по расстоянию и стерео по стороне. Звук сзади и спереди
 * в стерео звучит одинаково — направление подскажут ноты над прячущимся.
 */
export function spatialize(listener: Listener, source: Vec3): { volume: number; pan: number } {
  const dx = source.x - listener.position.x;
  const dz = source.z - listener.position.z;
  const distance = Math.hypot(dx, source.y - listener.position.y, dz);
  const volume = Math.max(WHISTLE_MIN_VOLUME, 1 - distance / WHISTLE_DISTANCE);
  const flat = Math.hypot(dx, dz);
  const side = flat > 0.01 ? (dx * listener.rightX + dz * listener.rightZ) / flat : 0;
  return { volume, pan: Math.max(-MAX_PAN, Math.min(MAX_PAN, side * MAX_PAN)) };
}

/**
 * Когда какой звук играть. Логика отдельно от синтеза: её можно тестировать без Web Audio.
 */
export class GameSounds {
  private lastPhase: RoomSnapshot['phase'] | null = null;
  private lastTickSecond = -1;

  constructor(private readonly sfx: Pick<Sfx, 'splat' | 'found' | 'tick' | 'phase' | 'win' | 'lose' | 'whistle'>) {}

  onRoom(room: RoomSnapshot | null, myRole: Role | null): void {
    const phase = room?.phase ?? null;
    if (phase === this.lastPhase) return;
    const previous = this.lastPhase;
    this.lastPhase = phase;
    if (!room || previous === null) return; // вход в комнату — не смена фазы

    if (phase === 'results' && room.result) {
      if (room.result.winner === myRole) this.sfx.win();
      else this.sfx.lose();
    } else if (phase === 'hiding' || phase === 'seeking') {
      this.sfx.phase();
    }
  }

  /** Громкость шлепка зависит от расстояния: прячущийся слышит, что ищущий рядом. */
  onShot(shot: ShotEvent, listener: Vec3): void {
    if (shot.hitPlayerId) {
      this.sfx.found();
      return;
    }
    if (!shot.point) return;
    const distance = Math.hypot(shot.point.x - listener.x, shot.point.y - listener.y, shot.point.z - listener.z);
    this.sfx.splat(Math.max(0.1, 1 - distance / HEARING_DISTANCE));
  }

  /** Подсказка: каждый свистнувший — со своего места. Свой свист слышен ровно по центру: «тебя выдали». */
  onHint(ping: HintPing, myId: string | null, listener: Listener): void {
    for (const player of ping.players) {
      if (player.id === myId) {
        this.sfx.whistle(0.6, 0);
        continue;
      }
      const { volume, pan } = spatialize(listener, player);
      this.sfx.whistle(volume, pan);
    }
  }

  /** Каждый кадр: тиканье последних секунд пряток и поиска. */
  update(room: RoomSnapshot | null, serverNow: number): void {
    const inGame = room?.phase === 'hiding' || room?.phase === 'seeking';
    if (!inGame || !room.phaseEndsAt) return;
    const secondsLeft = Math.ceil((room.phaseEndsAt - serverNow) / 1000);
    if (secondsLeft > 0 && secondsLeft <= TICK_FROM_SECONDS && secondsLeft !== this.lastTickSecond) {
      this.lastTickSecond = secondsLeft;
      this.sfx.tick();
    }
  }
}
