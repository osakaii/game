import type { GameSocket } from '../common/socket-types';
import type { Room } from './room';

/**
 * Отправить одному сокету все кожи комнаты, у которых есть картинка.
 * Нужно новичку (иначе он увидит всех белыми) и вернувшемуся после перезагрузки —
 * он получит обратно и свою собственную кожу.
 */
export function emitRoomSkins(client: GameSocket, room: Room): void {
  for (const member of room.allMembers()) {
    const { image, revision } = member.skin;
    if (image) client.emit('player:skin', { playerId: member.id, revision, image });
  }
}
