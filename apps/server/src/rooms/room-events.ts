import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { HintPing, ShotEvent, TeleportPayload } from '@mecha/shared';
import type { Room } from './room';

export interface TeleportEvent {
  playerId: string;
  position: TeleportPayload;
}

/**
 * Шина доменных событий комнат.
 *
 * Сервисы (правила игры) сообщают «что произошло», не зная про сокеты.
 * Gateway подписывается и переводит события в сетевые сообщения.
 * Так GameService может сменить фазу по таймеру, хотя никакой клиент его об этом не просил.
 *
 * Subject из rxjs — «канал»: next(value) отправляет значение всем подписчикам.
 */
@Injectable()
export class RoomEvents {
  /** Состояние комнаты изменилось — надо разослать room:state. */
  readonly changed = new Subject<Room>();
  /** Игрок покинул комнату (вышел сам или отключился). */
  readonly playerLeft = new Subject<Room>();
  /** Сервер переставил игрока. */
  readonly teleported = new Subject<TeleportEvent>();
  /** Игрок загрузил новую кожу — разослать остальным. */
  readonly skin = new Subject<{ room: Room; playerId: string }>();
  /** Ищущий проверил место. */
  readonly shot = new Subject<{ room: Room; shot: ShotEvent }>();
  /** Подсказка: прячущиеся свистнули — разослать всей комнате. */
  readonly hint = new Subject<{ room: Room; ping: HintPing }>();
}
