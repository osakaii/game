import type { RoomSnapshot } from '@mecha/shared';
import { describeSettings } from './settings-dialog';
import { $ } from './dom';

interface RoomPanelHandlers {
  onInvite(): void;
  onSettings(): void;
}

/**
 * Комната в игре: маленькая плашка «КОД · 2/8» в углу и шторка справа по тапу на неё.
 *
 * Раньше всё это было открытой панелью на 70% высоты экрана — на телефоне в альбомной ориентации
 * она закрывала кнопки и зону поворота камеры. Теперь на экране только плашка, а список игроков,
 * настройки и приглашение — в шторке, когда они нужны. «Выйти» — в меню игры (☰).
 */
export class RoomPanel {
  private readonly chip = $<HTMLButtonElement>('#room-chip');
  private readonly chipCode = $('#room-chip-code');
  private readonly chipCount = $('#room-chip-count');
  private readonly sheet = $('#room-sheet');
  private readonly sheetCode = $('#room-sheet-code');
  private readonly list = $<HTMLUListElement>('#player-list');
  private readonly settingsSummary = $<HTMLButtonElement>('#room-settings-summary');
  private phase: RoomSnapshot['phase'] | null = null;

  constructor(handlers: RoomPanelHandlers) {
    this.chip.addEventListener('click', () => this.setOpen(!this.open));
    $('#room-sheet-close').addEventListener('click', () => this.setOpen(false));
    // Тап по затемнению мимо шторки закрывает её.
    this.sheet.addEventListener('pointerdown', (e) => {
      if (e.target === this.sheet) this.setOpen(false);
    });
    $('#invite').addEventListener('click', () => handlers.onInvite());
    this.settingsSummary.addEventListener('click', () => handlers.onSettings());
  }

  get open(): boolean {
    return !this.sheet.hidden;
  }

  setOpen(open: boolean): void {
    this.sheet.hidden = !open;
    this.chip.setAttribute('aria-expanded', String(open));
  }

  render(room: RoomSnapshot | null, myId: string | null): void {
    this.chip.hidden = !room;
    if (!room) {
      this.setOpen(false);
      this.phase = null;
      return;
    }
    // Началась новая фаза (раунд, итоги) — шторка уезжает: на экране теперь игра, а не список.
    if (this.phase !== null && this.phase !== room.phase) this.setOpen(false);
    this.phase = room.phase;

    this.chipCode.textContent = room.code;
    this.chipCount.textContent = `${room.players.length}/${room.maxPlayers}`;
    this.sheetCode.textContent = room.code;

    const isHost = room.hostId === myId;
    this.settingsSummary.textContent = `${describeSettings(room.settings)}${isHost ? ' — изменить' : ''}`;

    // Ник — ввод другого игрока. Только textContent, никакого innerHTML:
    // ник вида <img src=x onerror=...> иначе выполнится у всех в комнате (XSS).
    const items = room.players.map((player) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'nickname';
      name.textContent = player.connected ? player.nickname : `${player.nickname} · нет связи`;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = String(player.score);
      li.append(name, score);
      if (player.id === room.hostId) li.classList.add('host');
      if (player.id === myId) li.classList.add('me');
      if (player.role) li.dataset.role = player.role;
      if (player.found) li.classList.add('found');
      if (!player.connected) li.classList.add('offline');
      return li;
    });
    this.list.replaceChildren(...items);
  }
}
