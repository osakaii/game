import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { TelemetryGateway } from './telemetry.gateway';
import { TelemetryService } from './telemetry.service';

@Module({
  controllers: [StatsController],
  providers: [TelemetryService, TelemetryGateway],
})
export class TelemetryModule {}
