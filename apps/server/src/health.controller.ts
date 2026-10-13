import { Controller, Get } from '@nestjs/common';

/** Обычный HTTP-эндпоинт: проверить, что сервер жив (пригодится для деплоя). */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
