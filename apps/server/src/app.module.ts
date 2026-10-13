import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { NetModule } from './net/net.module';
import { MovementModule } from './movement/movement.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [NetModule, RoomsModule, MovementModule],
  controllers: [HealthController],
})
export class AppModule {}
