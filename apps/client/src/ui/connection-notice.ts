import type { ConnectionStatus } from '../net/network';

/** Дольше этого сервер не ответил — скорее всего, Render будит уснувший сервер (до минуты). */
export const WAKE_HINT_MS = 5000;
/** Дольше даже холодный старт не длится — значит, дело в интернете или сервер упал. */
export const GIVE_UP_HINT_MS = 90_000;

/**
 * Что сказать на главном экране, пока кнопки ждут сервер. null — связь есть, говорить нечего.
 *
 * Без подписи серая кнопка выглядит сломанной: игрок жмёт и не понимает, почему ничего не происходит.
 */
export function connectionNotice(status: ConnectionStatus, waitedMs: number, browserOnline = true): string | null {
  if (status.state === 'online') return null;
  // Другая вкладка, несовместимая версия — ждать бесполезно, сеть сама скажет, что делать.
  if (!status.retrying) return capitalize(status.text);
  if (!browserOnline) return 'Нет интернета — проверь связь';
  if (waitedMs < WAKE_HINT_MS) return 'Подключаемся к серверу…';
  if (waitedMs < GIVE_UP_HINT_MS) return 'Сервер просыпается — это до минуты…';
  return 'Сервер не отвечает — проверь интернет или зайди позже';
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
