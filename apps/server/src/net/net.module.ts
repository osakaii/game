import { Module } from '@nestjs/common';
import { NetGateway } from './net.gateway';

/** Служебные сетевые события: приветствие, пинг. */
@Module({
  providers: [NetGateway],
})
export class NetModule {}
