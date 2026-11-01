import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { EventSink, NullSink } from './event-sink';
import { PgSink } from './pg-sink';

/**
 * Global — AnalyticsService нужен почти всем модулям (вход, комнаты, раунды),
 * без него каждый перечислял бы этот модуль в imports.
 */
@Global()
@Module({
  providers: [
    {
      provide: EventSink,
      // Базы нет (локально, в CI, e2e) — статистика выключена, игра та же.
      useFactory: () => (process.env.DATABASE_URL ? new PgSink(process.env.DATABASE_URL) : new NullSink()),
    },
    AnalyticsService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
