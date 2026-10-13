import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { SessionModule } from '../session/session.module';
import { NetGateway } from './net.gateway';

/** Подключения: сессии, приветствие, пинг. */
@Module({
  imports: [SessionModule, RoomsModule],
  providers: [NetGateway],
})
export class NetModule {}
