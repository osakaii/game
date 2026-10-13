import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 — слушаем все сетевые интерфейсы, чтобы телефон в той же Wi-Fi сети достучался.
  await app.listen(port, '0.0.0.0');
  Logger.log(`Server listening on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
