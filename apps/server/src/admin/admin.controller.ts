import { Controller, Get, Header, NotFoundException, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminKeyGuard } from './admin-key.guard';
import { ADMIN_PAGE } from './admin-page';
import { AdminStatsService, MAX_DAYS, type AdminStats } from './admin-stats.service';

const DaysSchema = z.coerce.number().int().min(1).max(MAX_DAYS).catch(14);

/**
 * /stats/admin — страница статистики. Сама страница — пустая оболочка без цифр, её можно отдать любому;
 * цифры (там ники) — только по ключу, запросом /stats/admin/api.
 *
 * Под /stats, а не /admin: service worker игры пропускает /stats мимо себя, и так делают все его версии,
 * уже стоящие на телефонах. /admin старый SW перехватил бы: запрос цифр падал, а страница ложилась
 * в кэш вместо страницы игры.
 */
@Controller('stats/admin')
export class AdminController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  // Поисковикам страница не нужна, а адрес, с которого перешли по ссылке, чужим сайтам знать незачем.
  @Header('X-Robots-Tag', 'noindex')
  @Header('Referrer-Policy', 'no-referrer')
  page(): string {
    if (!process.env.ADMIN_KEY) throw new NotFoundException();
    return ADMIN_PAGE;
  }

  @Get('api')
  @UseGuards(AdminKeyGuard)
  @Header('Cache-Control', 'no-store')
  async summary(@Query('days') days: unknown): Promise<AdminStats> {
    if (!this.stats.enabled) throw new ServiceUnavailableException('Статистика выключена: на сервере нет DATABASE_URL');
    return this.stats.stats(DaysSchema.parse(days));
  }
}
