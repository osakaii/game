import { Controller, Get, Header } from '@nestjs/common';
import { TelemetryService, type TelemetryStats } from './telemetry.service';

/**
 * GET /stats — сводка телеметрии: FPS по видеокартам, уровни автокачества, частые ошибки JS.
 * Только агрегаты, без id и ников игроков — адрес можно открыть хоть с телефона.
 */
@Controller('stats')
export class StatsController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get()
  // Сводка меняется с каждым отчётом — кэшировать её браузеру или CDN нельзя.
  @Header('Cache-Control', 'no-store')
  stats(): TelemetryStats {
    return this.telemetry.stats();
  }
}
