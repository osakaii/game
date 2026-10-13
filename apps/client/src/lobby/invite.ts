import { toast } from '../ui/toast';

const ROOM_PARAM = 'room';

export function roomCodeFromUrl(): string | null {
  return new URL(location.href).searchParams.get(ROOM_PARAM);
}

/** Держим код комнаты в адресной строке: ссылку можно переслать, а перезагрузка не теряет комнату. */
export function setRoomInUrl(code: string | null): void {
  const url = new URL(location.href);
  if (code) url.searchParams.set(ROOM_PARAM, code);
  else url.searchParams.delete(ROOM_PARAM);
  // replaceState меняет адрес без перезагрузки и без новой записи в истории «Назад».
  history.replaceState(null, '', url);
}

/**
 * Web Share API открывает системное меню «Поделиться» (Telegram, WhatsApp...).
 * И share, и clipboard работают только в secure context: https или localhost.
 * По http://192.168.x.x с телефона их нет — тогда просто показываем код.
 */
export async function inviteToRoom(code: string): Promise<void> {
  const url = new URL(location.href);
  url.searchParams.set(ROOM_PARAM, code);
  const link = url.toString();

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mecha', text: `Заходи в комнату ${code}`, url: link });
      return;
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return; // пользователь закрыл меню
    }
  }
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка скопирована');
      return;
    } catch {
      /* нет доступа к буферу — ниже покажем код */
    }
  }
  toast(`Код комнаты: ${code}`, 4000);
}
