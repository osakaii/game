import { Module } from '@nestjs/common';
import { GameModule } from './game/game.module';
import { HealthController } from './health.controller';
import { NetModule } from './net/net.module';
import { MovementModule } from './movement/movement.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [NetModule, RoomsModule, MovementModule, GameModule],
  controllers: [HealthController],
})
export class AppModule {}
