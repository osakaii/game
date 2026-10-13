import type { RoomSnapshot } from '@mecha/shared';
import { $ } from './dom';

interface RoomPanelHandlers {
  onLeave(): void;
  onInvite(): void;
}

/** Панель комнаты в игре: код, список игроков, «пригласить», «выйти». */
export class RoomPanel {
  private readonly root = $('#room-panel');
  private readonly codeEl = $('#room-panel-code');
  private readonly countEl = $('#room-panel-count');
  private readonly list = $<HTMLUListElement>('#player-list');

  constructor(handlers: RoomPanelHandlers) {
    $('#leave-room').addEventListener('click', () => handlers.onLeave());
    $('#invite').addEventListener('click', () => handlers.onInvite());
  }

  render(room: RoomSnapshot | null, myId: string | null): void {
    this.root.hidden = !room;
    if (!room) return;

    this.codeEl.textContent = room.code;
    this.countEl.textContent = `${room.players.length}/${room.maxPlayers}`;

    // Ник — ввод другого игрока. Только textContent, никакого innerHTML:
    // ник вида <img src=x onerror=...> иначе выполнится у всех в комнате (XSS).
    const items = room.players.map((player) => {
      const li = document.createElement('li');
      li.textContent = player.nickname;
      if (player.id === room.hostId) li.classList.add('host');
      if (player.id === myId) li.classList.add('me');
      return li;
    });
    this.list.replaceChildren(...items);
  }
}
