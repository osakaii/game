import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Subject } from 'rxjs';

/**
 * Сколько ждём переподключения, прежде чем выкинуть игрока из комнаты.
 * Минута: на телефоне игрок сворачивает браузер — отправить код друзьям в мессенджер, ответить
 * на сообщение. 20 секунд на это не хватало, и он «выбывал». Дольше — призрак отключённого мешал бы раунду.
 */
export const RECONNECT_GRACE_MS = 60_000;

interface Session {
  playerId: string;
  /** Текущий сокет. null — игрок отключён и ждёт переподключения. */
  socketId: string | null;
  expireTimer?: ReturnType<typeof setTimeout>;
}

export interface AttachResult {
  playerId: string;
  /** true — это переподключение к существующей сессии. */
  resumed: boolean;
  /** Сокет, который держал эту сессию раньше (вторая вкладка с той же сессией) — его надо закрыть. */
  replacedSocketId: string | null;
}

/**
 * Сессии игроков: секретный sessionId (знает только клиент) -> публичный playerId.
 *
 * Отключился — сессия живёт RECONNECT_GRACE_MS. Вернулся вовремя — тот же playerId,
 * та же комната, та же роль. Не вернулся — событие expired, и игрока убирают из комнаты.
 */
@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, Session>();
  /** playerId, чья сессия истекла. */
  readonly expired = new Subject<string>();

  attach(sessionId: string, socketId: string): AttachResult {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      clearTimeout(existing.expireTimer);
      const replacedSocketId = existing.socketId;
      existing.socketId = socketId;
      return { playerId: existing.playerId, resumed: true, replacedSocketId };
    }
    // 12 случайных байт -> 16 символов base64url. Угадать чужой id нереально, но он и не секрет.
    const playerId = randomBytes(12).toString('base64url');
    this.sessions.set(sessionId, { playerId, socketId });
    return { playerId, resumed: false, replacedSocketId: null };
  }

  detach(sessionId: string, socketId: string): void {
    const session = this.sessions.get(sessionId);
    // Сокет уже заменён новым (переподключение пришло раньше, чем отключение старого) — ничего не делаем.
    if (!session || session.socketId !== socketId) return;

    session.socketId = null;
    session.expireTimer = setTimeout(() => {
      this.sessions.delete(sessionId);
      this.logger.log(`session of ${session.playerId} expired`);
      this.expired.next(session.playerId);
    }, RECONNECT_GRACE_MS);
  }

  isConnected(sessionId: string): boolean {
    return !!this.sessions.get(sessionId)?.socketId;
  }

  onModuleDestroy() {
    for (const session of this.sessions.values()) clearTimeout(session.expireTimer);
  }
}
