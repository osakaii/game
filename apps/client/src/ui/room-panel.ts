import { GAME_RULES, type RoomSnapshot } from '@mecha/shared';
import { $ } from './dom';

interface RoomPanelHandlers {
  onLeave(): void;
  onInvite(): void;
  onStart(): void;
}

/** Панель комнаты в игре: код, список игроков, «начать», «пригласить», «выйти». */
export class RoomPanel {
  private readonly root = $('#room-panel');
  private readonly codeEl = $('#room-panel-code');
  private readonly countEl = $('#room-panel-count');
  private readonly list = $<HTMLUListElement>('#player-list');
  private readonly startButton = $<HTMLButtonElement>('#start-game');

  constructor(handlers: RoomPanelHandlers) {
    $('#leave-room').addEventListener('click', () => handlers.onLeave());
    $('#invite').addEventListener('click', () => handlers.onInvite());
    this.startButton.addEventListener('click', () => handlers.onStart());
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

    // Ник — ввод другого игрока. Только textContent, никакого innerHTML:
    // ник вида <img src=x onerror=...> иначе выполнится у всех в комнате (XSS).
    const items = room.players.map((player) => {
      const li = document.createElement('li');
      li.textContent = player.nickname;
      if (player.id === room.hostId) li.classList.add('host');
      if (player.id === myId) li.classList.add('me');
      if (player.role) li.dataset.role = player.role;
      if (player.found) li.classList.add('found');
      return li;
    });
    this.list.replaceChildren(...items);
  }
}
