import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GameModule } from './game/game.module';
import { HealthController } from './health.controller';
import { NetModule } from './net/net.module';
import { MovementModule } from './movement/movement.module';
import { RoomsModule } from './rooms/rooms.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [AnalyticsModule, NetModule, RoomsModule, MovementModule, GameModule, TelemetryModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
