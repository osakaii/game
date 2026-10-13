import { Logger } from '@nestjs/common';
import type { ErrorCode, Result } from '@mecha/shared';
import type { z } from 'zod';

/** Ожидаемая ошибка бизнес-логики (комната не найдена, переполнена...). Уходит клиенту как код. */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Проверяет данные из сети схемой zod. Неверные данные — GameError('INVALID_INPUT'). */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new GameError('INVALID_INPUT', parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

const logger = new Logger('Respond');

/**
 * Превращает функцию, которая может бросить GameError, в Result для ack-ответа.
 * Неожиданные ошибки логируем целиком, а клиенту отдаём только INTERNAL —
 * детали реализации наружу не показываем.
 */
export function respond<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, data: fn() };
  } catch (error) {
    if (error instanceof GameError) {
      return { ok: false, error: error.code, message: error.message };
    }
    logger.error(error);
    return { ok: false, error: 'INTERNAL' };
  }
}
