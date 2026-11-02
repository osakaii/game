import { Module } from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';
import { AdminController } from './admin.controller';
import { AdminStatsService } from './admin-stats.service';

/** Страница статистики /stats/admin. База — EventSink из глобального AnalyticsModule. */
@Module({
  controllers: [AdminController],
  providers: [AdminStatsService, AdminKeyGuard],
})
export class AdminModule {}
