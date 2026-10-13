import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { MovementGateway } from './movement.gateway';

@Module({
  // RoomsModule экспортирует RoomsService — импортируем модуль, чтобы получить его через DI.
  imports: [RoomsModule],
  providers: [MovementGateway],
})
export class MovementModule {}
