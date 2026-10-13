import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { NetModule } from './net/net.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [NetModule, RoomsModule],
  controllers: [HealthController],
})
export class AppModule {}
