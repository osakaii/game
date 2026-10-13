import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // SIGTERM (docker stop, перезапуск на хостинге) -> onModuleDestroy у всех провайдеров:
  // таймеры раундов и сессий останавливаются аккуратно.
  app.enableShutdownHooks();

  // В продакшене сервер сам раздаёт собранный клиент: один процесс, один домен, без CORS.
  const clientDist = process.env.CLIENT_DIST;
  if (clientDist) {
    // gzip: бандл three.js ~700 KB превращается в ~180 KB. На мобильном интернете это секунды загрузки.
    // Если перед сервером стоит CDN/прокси со сжатием — middleware можно убрать.
    app.use(compression());
    app.useStaticAssets(clientDist, {
      setHeaders(res, path) {
        // Файлы из assets/ содержат хэш в имени (index-CVoZQou_.js): содержимое под этим именем
        // никогда не изменится, можно кэшировать навсегда. index.html — всегда свежий,
        // иначе после деплоя браузер продолжит грузить старые ссылки.
        res.setHeader(
          'Cache-Control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    Logger.log(`Serving client from ${clientDist}`, 'Bootstrap');
  }

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 — слушаем все сетевые интерфейсы: телефон в той же Wi-Fi сети и контейнер Docker.
  await app.listen(port, '0.0.0.0');
  Logger.log(`Server listening on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
