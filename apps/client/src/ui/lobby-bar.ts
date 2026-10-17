import { GAME_RULES, type RoomSnapshot } from '@mecha/shared';
import { $ } from './dom';

interface LobbyBarHandlers {
  onInvite(): void;
  onStart(): void;
}

/**
 * Панель лобби по центру сверху — пока раунда нет, у игрока одно главное дело, и оно здесь:
 * хосту — позвать друзей или начать, остальным — позвать друзей и ждать хоста.
 * Верх по центру свободен (таймер раунда появится там же, когда лобби закончится), и пальцы,
 * лежащие на джойстике и кнопках, его не закрывают.
 */
export class LobbyBar {
  private readonly root = $('#lobby-bar');
  private readonly status = $('#lobby-status');
  private readonly invite = $<HTMLButtonElement>('#lobby-invite');
  private readonly start = $<HTMLButtonElement>('#start-game');

  constructor(handlers: LobbyBarHandlers) {
    this.invite.addEventListener('click', () => handlers.onInvite());
    this.start.addEventListener('click', () => handlers.onStart());
  }

  render(room: RoomSnapshot | null, myId: string | null): void {
    this.root.hidden = room?.phase !== 'lobby';
    if (!room || room.phase !== 'lobby') return;

    const isHost = room.hostId === myId;
    const missing = GAME_RULES.minPlayers - room.players.length;
    const canStart = isHost && missing <= 0;
    this.start.hidden = !canStart;
    // Пока начинать нельзя, главная кнопка — «Пригласить»; когда можно — «Начать», а приглашение вторично.
    this.invite.classList.toggle('primary', !canStart);

    if (missing > 0) this.status.textContent = `Нужен ещё ${missing} ${missing === 1 ? 'игрок' : missing < 5 ? 'игрока' : 'игроков'}`;
    else if (isHost) this.status.textContent = '';
    else {
      const host = room.players.find((p) => p.id === room.hostId);
      // textContent: ник — чужой ввод, как HTML его не вставляем.
      this.status.textContent = host ? `Ждём, когда ${host.nickname} начнёт` : 'Ждём хоста';
    }
    this.status.hidden = this.status.textContent === '';
  }
}
