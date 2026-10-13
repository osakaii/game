import type { ErrorCode } from '@mecha/shared';

/** Record<ErrorCode, string> — TypeScript заставит добавить текст для каждого нового кода ошибки. */
const MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: 'Проверьте ник и код комнаты',
  ROOM_NOT_FOUND: 'Комната не найдена',
  ROOM_FULL: 'Комната заполнена',
  GAME_IN_PROGRESS: 'Игра уже идёт, дождитесь конца раунда',
  ALREADY_IN_ROOM: 'Вы уже в комнате',
  NOT_HOST: 'Начать игру может только хост',
  NOT_ENOUGH_PLAYERS: 'Нужно минимум 2 игрока',
  PAINT_NOT_ALLOWED: 'Сейчас краситься нельзя',
  SHOT_NOT_ALLOWED: 'Сейчас проверять нельзя',
  RATE_LIMITED: 'Слишком часто, помедленнее',
  INTERNAL: 'Ошибка сервера, попробуйте ещё раз',
  TIMEOUT: 'Сервер не отвечает',
};

export function errorMessage(code: ErrorCode): string {
  return MESSAGES[code];
}
