import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [RoomsModule],
  providers: [GameService, GameGateway],
})
export class GameModule {}
