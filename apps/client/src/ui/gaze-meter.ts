import { GAZE_RULES, type GazeUpdate, type Role, type RoomPhase } from '@mecha/shared';
import { $ } from './dom';

/**
 * Значок «на тебя смотрят» под баннером — только у прячущегося во время поиска.
 *
 * Сервер шлёт `gaze:update` лишь при смене (начали/перестали смотреть, прибавилось очко) и после
 * переподключения. Поэтому состояние держим здесь и сбрасываем сами — вне поиска. Найденному больше
 * не смотрят в лицо (сервер его не проверяет), но набранное остаётся до итогов.
 */
export class GazeMeter {
  private readonly root = $('#gaze');
  private readonly count = $('#gaze-count');
  private watched = false;
  private points = 0;
  private shownText = '';
  private explained = false;

  /** true — на тебя посмотрели впервые за раунд: пора объяснить, что значит значок. */
  onUpdate(update: GazeUpdate): boolean {
    this.watched = update.watched;
    this.points = update.points;
    if (!update.watched || this.explained) return false;
    this.explained = true;
    return true;
  }

  /**
   * Каждый кадр: DOM трогаем только при изменении. phase = null — комнаты ещё нет (страницу
   * перезагрузили посреди поиска): не сбрасываем — `gaze:update` мог прийти раньше `room:state`.
   */
  update(phase: RoomPhase | null, role: Role | null, found: boolean): void {
    if (phase !== null && phase !== 'seeking') {
      this.watched = false;
      this.points = 0;
      this.explained = false;
    }
    const watched = this.watched && !found;
    const visible = phase === 'seeking' && role === 'hider' && (watched || this.points > 0);
    if (this.root.hidden === visible) this.root.hidden = !visible;
    if (!visible) return;
    this.root.classList.toggle('watched', watched);
    this.root.classList.toggle('full', this.points >= GAZE_RULES.maxPoints);
    const text = `+${this.points}`;
    if (text !== this.shownText) {
      this.shownText = text;
      this.count.textContent = text;
    }
  }
}
