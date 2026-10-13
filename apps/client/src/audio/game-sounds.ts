import type { Role, RoomSnapshot, ShotEvent, Vec3 } from '@mecha/shared';
import type { Sfx } from './sfx';

const TICK_FROM_SECONDS = 5;
/** Дальше этого расстояния (м) шлепок едва слышен. */
const HEARING_DISTANCE = 20;

/**
 * Когда какой звук играть. Логика отдельно от синтеза: её можно тестировать без Web Audio.
 */
export class GameSounds {
  private lastPhase: RoomSnapshot['phase'] | null = null;
  private lastTickSecond = -1;

  constructor(private readonly sfx: Pick<Sfx, 'splat' | 'found' | 'tick' | 'phase' | 'win' | 'lose'>) {}

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
