import { Module } from '@nestjs/common';
import { RoomEvents } from './room-events';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';

@Module({
  providers: [RoomsService, RoomEvents, RoomsGateway],
  // exports — чтобы другие модули (движение, игра) могли внедрить эти сервисы.
  exports: [RoomsService, RoomEvents],
})
export class RoomsModule {}
