import { GAME_RULES, type RoomSnapshot } from '@mecha/shared';
import { describeSettings } from './settings-dialog';
import { $ } from './dom';

interface RoomPanelHandlers {
  onLeave(): void;
  onInvite(): void;
  onStart(): void;
  onSettings(): void;
}

/** Панель комнаты в игре: код, список игроков, «начать», «пригласить», «выйти». */
export class RoomPanel {
  private readonly root = $('#room-panel');
  private readonly codeEl = $('#room-panel-code');
  private readonly countEl = $('#room-panel-count');
  private readonly list = $<HTMLUListElement>('#player-list');
  private readonly startButton = $<HTMLButtonElement>('#start-game');
  private readonly settingsSummary = $<HTMLButtonElement>('#room-settings-summary');

  constructor(handlers: RoomPanelHandlers) {
    $('#leave-room').addEventListener('click', () => handlers.onLeave());
    $('#invite').addEventListener('click', () => handlers.onInvite());
    this.startButton.addEventListener('click', () => handlers.onStart());
    this.settingsSummary.addEventListener('click', () => handlers.onSettings());
  }

  render(room: RoomSnapshot | null, myId: string | null): void {
    this.root.hidden = !room;
    if (!room) return;

    this.codeEl.textContent = room.code;
    this.countEl.textContent = `${room.players.length}/${room.maxPlayers}`;

    const isHost = room.hostId === myId;
    const enoughPlayers = room.players.length >= GAME_RULES.minPlayers;
    this.startButton.hidden = !(isHost && room.phase === 'lobby');
    this.startButton.disabled = !enoughPlayers;
    this.startButton.textContent = enoughPlayers ? 'Начать игру' : `Нужно ${GAME_RULES.minPlayers}+ игрока`;
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
