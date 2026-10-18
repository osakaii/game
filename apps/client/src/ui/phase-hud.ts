import type { Role, RoomSnapshot, WinReason } from '@mecha/shared';
import { $ } from './dom';

const PHASE_TITLES = {
  hiding: 'Прятки',
  seeking: 'Поиск',
} as const;

/**
 * Что делать прямо сейчас — одним-двумя словами. На телефоне баннер должен быть коротким:
 * «Прятки 0:55 · ты прячешься» занимал полэкрана по ширине, а смысл тот же.
 */
const ROLE_ACTIONS: Record<keyof typeof PHASE_TITLES, Record<Role, string>> = {
  hiding: { hider: 'Прячься', seeker: 'Глаза закрыты' },
  seeking: { hider: 'Не попадись', seeker: 'Ищи' },
};

/** Текст баннера фазы: действие (или название фазы, если роли нет) и оставшееся время. */
export function bannerText(phase: keyof typeof PHASE_TITLES, role: Role | null, found: boolean, left: string): string {
  const action = found ? 'Тебя нашли' : role ? ROLE_ACTIONS[phase][role] : PHASE_TITLES[phase];
  return `${action} · ${left}`;
}

const WIN_TITLES: Record<Role, string> = {
  hider: 'Победили прячущиеся',
  seeker: 'Победили ищущие',
};

const WIN_REASONS: Record<WinReason, string> = {
  time_up: 'Время вышло — кто-то остался ненайденным',
  all_found: 'Всех нашли',
  seekers_left: 'Ищущие покинули игру',
  hiders_left: 'Прячущиеся покинули игру',
};

/**
 * Игровой интерфейс поверх 3D: баннер фазы с таймером, «закрытые глаза» ищущего, итоги раунда.
 *
 * Вызывается каждый кадр, но DOM трогает только когда текст реально изменился:
 * запись в DOM дорогая (пересчёт вёрстки), а таймер меняется раз в секунду.
 */
export class PhaseHud {
  private readonly banner = $('#phase-banner');
  private readonly blind = $('#blind');
  private readonly blindTimer = $('#blind-timer');
  private readonly results = $('#results');
  private readonly resultsTitle = $('#results-title');
  private readonly resultsReason = $('#results-reason');
  private readonly resultsTimer = $('#results-timer');
  private readonly resultsScores = $<HTMLOListElement>('#results-scores');
  private readonly cache = new Map<HTMLElement, string>();

  update(room: RoomSnapshot | null, myRole: Role | null, serverNow: number, found = false): void {
    const phase = room?.phase ?? 'lobby';
    const left = room?.phaseEndsAt ? formatSeconds(room.phaseEndsAt - serverNow) : '';

    const inGame = phase === 'hiding' || phase === 'seeking';
    this.toggle(this.banner, inGame);
    if (inGame) {
      this.setText(this.banner, bannerText(phase, myRole, found, left));
      this.banner.dataset.role = myRole ?? '';
    }

    const blind = phase === 'hiding' && myRole === 'seeker';
    this.toggle(this.blind, blind);
    if (blind) this.setText(this.blindTimer, left);

    const showResults = phase === 'results' && !!room?.result;
    this.toggle(this.results, showResults);
    if (showResults && room?.result) {
      const won = room.result.winner === myRole;
      this.results.dataset.outcome = won ? 'win' : 'lose';
      this.setText(this.resultsTitle, WIN_TITLES[room.result.winner]);
      this.setText(this.resultsReason, WIN_REASONS[room.result.reason]);
      this.setText(this.resultsTimer, `В лобби через ${left}`);
    }
  }

  /** Таблица очков на экране итогов. Вызывается при смене состояния комнаты, не каждый кадр. */
  renderScores(room: RoomSnapshot | null, myId: string | null): void {
    if (room?.phase !== 'results') return;
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const rows = sorted.map((player) => {
      const li = document.createElement('li');
      if (player.id === myId) li.classList.add('me');
      const name = document.createElement('span');
      name.className = 'nickname';
      name.textContent = player.nickname;
      const delta = document.createElement('span');
      delta.className = 'delta';
      delta.textContent = player.roundPoints > 0 ? `+${player.roundPoints}` : '';
      const total = document.createElement('span');
      total.textContent = String(player.score);
      li.append(name, delta, total);
      return li;
    });
    this.resultsScores.replaceChildren(...rows);
  }

  private setText(el: HTMLElement, text: string) {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }

  private toggle(el: HTMLElement, visible: boolean) {
    if (el.hidden === !visible) return;
    el.hidden = !visible;
  }
}

/** 95_400 мс -> «1:36». Округляем вверх: «0:00» показываем только когда время действительно вышло. */
function formatSeconds(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
