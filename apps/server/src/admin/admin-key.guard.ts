import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Неверных ключей подряд — не больше этого за окно, дальше 429: перебирать ключ бессмысленно. */
export const MAX_FAILURES = 10;
export const FAILURE_WINDOW_MS = 10 * 60_000;

/**
 * Сравнить ключи за одинаковое время. Обычное `===` выходит на первом несовпавшем символе —
 * по времени ответа ключ можно подбирать посимвольно. Хэши — чтобы длины всегда совпадали.
 */
export function keyMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Доступ к статистике — по ключу ADMIN_KEY в заголовке `X-Admin-Key` (не в адресе: адрес оседает
 * в истории браузера и логах). Ключ не задан — раздела нет совсем (404).
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  private failures: number[] = [];

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_KEY;
    if (!expected) throw new NotFoundException();
    const now = Date.now();
    this.failures = this.failures.filter((at) => now - at < FAILURE_WINDOW_MS);
    // Общий счётчик, не по IP: IP мы не храним, а ключ знает один человек — пусть подождёт 10 минут.
    if (this.failures.length >= MAX_FAILURES) throw new HttpException('Слишком много попыток', HttpStatus.TOO_MANY_REQUESTS);

    // Только то, что нужно от запроса Express, — без зависимости от его типов.
    const request = context.switchToHttp().getRequest<{ header(name: string): string | undefined }>();
    if (keyMatches(request.header('x-admin-key'), expected)) return true;
    this.failures.push(now);
    throw new UnauthorizedException();
  }
}
