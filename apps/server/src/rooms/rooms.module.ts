import { Module } from '@nestjs/common';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';

@Module({
  providers: [RoomsService, RoomsGateway],
  // exports — чтобы игровой модуль на этапе 4 мог внедрить RoomsService.
  exports: [RoomsService],
})
export class RoomsModule {}
