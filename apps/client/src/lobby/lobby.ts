import type { ErrorCode, PlayerInfo, RoomResult, RoomSnapshot } from '@mecha/shared';
import { Emitter } from '../core/emitter';
import type { Network } from '../net/network';

interface LobbyEvents {
  /** Комната изменилась; null — мы не в комнате. */
  room: RoomSnapshot | null;
  error: ErrorCode;
}

/**
 * Клиентское состояние лобби: в какой мы комнате и кто в ней.
 * UI только читает отсюда и вызывает методы — сам в сеть не ходит.
 */
export class Lobby extends Emitter<LobbyEvents> {
  room: RoomSnapshot | null = null;

  /** Код комнаты, которой мы «принадлежим». Состояния чужих комнат игнорируем. */
  private currentCode: string | null = null;
  private requestPending = false;
  /** Что повторить после переподключения: сервер при разрыве уже выкинул нас из комнаты. */
  private rejoin: { code: string; nickname: string } | null = null;
  private lastNickname = '';

  constructor(private readonly network: Network) {
    super();
    network.on('roomState', (room) => this.onRoomState(room));
    network.on('status', ({ state }) => {
      if (state === 'offline' && this.room) {
        this.rejoin = { code: this.room.code, nickname: this.lastNickname };
        this.reset();
      }
    });
    network.on('welcome', () => {
      const rejoin = this.rejoin;
      this.rejoin = null;
      if (rejoin) void this.join(rejoin.nickname, rejoin.code);
    });
  }

  get me(): PlayerInfo | undefined {
    return this.room?.players.find((p) => p.id === this.network.playerId);
  }

  get isHost(): boolean {
    return !!this.room && this.room.hostId === this.network.playerId;
  }

  get isReconnecting(): boolean {
    return this.rejoin !== null;
  }

  create(nickname: string): Promise<boolean> {
    return this.request(nickname, () => this.network.createRoom({ nickname }));
  }

  join(nickname: string, code: string): Promise<boolean> {
    return this.request(nickname, () => this.network.joinRoom({ nickname, code }));
  }

  /** Игрок этого клиента в текущей комнате. */
  get myRole() {
    return this.me?.role ?? null;
  }

  async startGame(): Promise<void> {
    const result = await this.network.startGame();
    if (!result.ok) this.emit('error', result.error);
  }

  leave(): void {
    this.network.leaveRoom();
    this.reset();
  }

  private async request(nickname: string, send: () => Promise<RoomResult>): Promise<boolean> {
    if (this.requestPending) return false; // защита от двойного тапа
    this.requestPending = true;
    this.lastNickname = nickname;
    try {
      const result = await send();
      if (!result.ok) {
        this.emit('error', result.error);
        return false;
      }
      this.currentCode = result.data.code;
      this.setRoom(result.data);
      return true;
    } finally {
      this.requestPending = false;
    }
  }

  /**
   * Сервер рассылает room:state ДО того, как придёт ack на наш create/join.
   * Поэтому пока запрос в полёте, принимаем любое состояние, а потом — только своей комнаты.
   * Без этой проверки «запоздавшее» состояние после выхода вернуло бы нас в комнату на экране.
   */
  private onRoomState(room: RoomSnapshot) {
    if (this.requestPending || room.code === this.currentCode) {
      this.currentCode = room.code;
      this.setRoom(room);
    }
  }

  private reset() {
    this.currentCode = null;
    this.setRoom(null);
  }

  private setRoom(room: RoomSnapshot | null) {
    this.room = room;
    this.emit('room', room);
  }
}
