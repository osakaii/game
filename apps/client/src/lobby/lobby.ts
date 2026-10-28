import type { ErrorCode, PlayerInfo, RoomResult, RoomSnapshot, UpdateSettingsPayload } from '@mecha/shared';
import { Emitter } from '../core/emitter';
import type { Network } from '../net/network';

/**
 * Как вернулись после обрыва связи:
 * resumed — сервер держал место, всё как было; rejoined — место потеряно, вошли заново по коду;
 * restarted — сервер перезапускался, комнату восстановили с прежним кодом (раунд — заново).
 */
export type RestoreKind = 'resumed' | 'rejoined' | 'restarted';

interface LobbyEvents {
  /** Комната изменилась; null — мы не в комнате. */
  room: RoomSnapshot | null;
  error: ErrorCode;
  /** Сейчас попробуем вернуться в комнату заново (новая запись о нас на сервере). */
  restoring: void;
  restored: RestoreKind;
  /** Вернуться в комнату не вышло: code — куда пытались (подставить в меню), reason — почему. */
  lost: { code: string; reason: ErrorCode };
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
  /** Ник, с которым входили, — чтобы вернуться под ним же (сервер мог добавить к нему « 2»). */
  private nickname: string | null = null;
  private serverStartedAt: number | null = null;

  constructor(private readonly network: Network) {
    super();
    network.on('roomState', (room) => this.onRoomState(room));
    // При разрыве связи комнату НЕ сбрасываем: сервер держит наше место RECONNECT_GRACE_MS.
    // После переподключения он сам скажет, где мы (welcome.roomCode), и пришлёт room:state.
    network.on('welcome', (welcome) => {
      const restarted = this.serverStartedAt !== null && welcome.serverStartedAt !== this.serverStartedAt;
      this.serverStartedAt = welcome.serverStartedAt;
      // welcome приходит при каждом подключении: если мы уже в комнате — это переподключение.
      if (this.room && welcome.roomCode === this.room.code) {
        this.emit('restored', 'resumed');
      } else if (this.room) {
        void this.restore(this.room.code, restarted);
      } else if (welcome.roomCode) {
        // Перезагрузили страницу посреди игры: сессия та же, сервер помнит комнату.
        // Следом придёт room:state — разрешаем его принять.
        this.currentCode = welcome.roomCode;
      }
    });
  }

  get me(): PlayerInfo | undefined {
    return this.room?.players.find((p) => p.id === this.network.playerId);
  }

  get isHost(): boolean {
    return !!this.room && this.room.hostId === this.network.playerId;
  }

  /** В комнате, но связь пропала — ждём переподключения. */
  get isReconnecting(): boolean {
    return !!this.room && this.network.state !== 'online';
  }

  create(nickname: string): Promise<boolean> {
    this.nickname = nickname;
    return this.request(() => this.network.createRoom({ nickname }));
  }

  join(nickname: string, code: string): Promise<boolean> {
    this.nickname = nickname;
    return this.request(() => this.network.joinRoom({ nickname, code }));
  }

  /** Игрок этого клиента в текущей комнате. */
  get myRole() {
    return this.me?.role ?? null;
  }

  async startGame(): Promise<void> {
    const result = await this.network.startGame();
    if (!result.ok) this.emit('error', result.error);
  }

  async updateSettings(patch: UpdateSettingsPayload): Promise<void> {
    const result = await this.network.updateSettings(patch);
    if (!result.ok) this.emit('error', result.error);
  }

  leave(): void {
    this.network.leaveRoom();
    this.reset();
  }

  private async request(send: () => Promise<RoomResult>): Promise<boolean> {
    if (this.requestPending) return false; // защита от двойного тапа
    const result = await this.attempt(send);
    if (!result.ok) this.emit('error', result.error);
    return result.ok;
  }

  /** Запрос входа/создания без показа ошибки: вызывающий решает сам, что делать с отказом. */
  private async attempt(send: () => Promise<RoomResult>): Promise<RoomResult> {
    this.requestPending = true;
    try {
      const result = await send();
      if (result.ok) {
        this.currentCode = result.data.code;
        this.setRoom(result.data);
      }
      return result;
    } finally {
      this.requestPending = false;
    }
  }

  /**
   * Сервер нас не помнит: место истекло (долго без связи) или сервер перезапускался (деплой).
   * Возвращаемся сами, по коду: есть комната — входим; нет (перезапуск стёр все) — пересоздаём её
   * с тем же кодом, и друзья, вернувшись следом, попадут к нам; кто-то успел раньше — входим к нему.
   */
  private async restore(code: string, restarted: boolean): Promise<void> {
    const nickname = this.nickname;
    if (!nickname) {
      this.reset();
      this.emit('lost', { code, reason: 'SESSION_EXPIRED' });
      return;
    }
    this.emit('restoring', undefined);
    const join = () => this.network.joinRoom({ nickname, code });
    let result = await this.attempt(join);
    if (!result.ok && result.error === 'ROOM_NOT_FOUND') {
      result = await this.attempt(() => this.network.createRoom({ nickname, code }));
      if (!result.ok && result.error === 'ROOM_EXISTS') result = await this.attempt(join);
    }
    if (result.ok) {
      this.emit('restored', restarted ? 'restarted' : 'rejoined');
    } else {
      this.reset();
      this.emit('lost', { code, reason: result.error });
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
