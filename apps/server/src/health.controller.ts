import { Controller, Get } from '@nestjs/common';
import { BUILD_INFO } from './common/build-info';

/** Обычный HTTP-эндпоинт: проверить, что сервер жив (пригодится для деплоя). */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime(), ...BUILD_INFO };
  }
}
