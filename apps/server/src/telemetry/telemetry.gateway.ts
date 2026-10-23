import { UseGuards } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { ClientReportSchema } from '@mecha/shared';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { GATEWAY_OPTIONS, playerIdOf, type GameSocket } from '../common/socket-types';
import { TelemetryService } from './telemetry.service';

@WebSocketGateway(GATEWAY_OPTIONS)
@UseGuards(RateLimitGuard)
export class TelemetryGateway {
  constructor(private readonly telemetry: TelemetryService) {}

  @SubscribeMessage('client:report')
  // Замер — раз в 30 с, ошибки — до 5 за сессию: пачка из нескольких допустима, поток — нет.
  @RateLimit(0.2, 6)
  onReport(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): void {
    const parsed = ClientReportSchema.safeParse(body);
    // Мусор молча игнорируем: отчёт ни на что не влияет, отвечать на него незачем.
    if (!parsed.success) return;
    this.telemetry.record(playerIdOf(client), parsed.data);
  }
}
