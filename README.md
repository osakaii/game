# Mecha

Мобильная браузерная игра в прятки с покраской (по мотивам Meccha Chameleon).

## Структура

```
apps/client      Vite + TypeScript + three.js
apps/server      NestJS + socket.io gateway
packages/shared  сетевой протокол и общие типы
```

## Запуск

```bash
pnpm install
pnpm dev
```

- клиент: http://localhost:5173 (с телефона — `Network`-адрес из лога Vite, та же Wi-Fi сеть)
- сервер: http://localhost:3000/health

Другие команды: `pnpm test` (vitest), `pnpm build`, `pnpm typecheck`.

## Версии

Версия игры — [SemVer](https://semver.org/lang/ru/) `MAJOR.MINOR.PATCH`, единая для всего монорепо
(`packages/shared/src/version.ts` и все `package.json`; тест проверяет, что они совпадают).

1. По ходу работы записывай изменения в раздел `[Unreleased]` файла [CHANGELOG.md](CHANGELOG.md).
2. Выпуск: `pnpm release patch` (исправления) / `minor` (новое без поломок) / `major` (несовместимое).
3. Скрипт подскажет команды для коммита и git-тега.

Версия и коммит сборки видны в меню игры и в `GET /health`. Если после деплоя у игрока открыта старая вкладка,
игра предложит обновиться; при несовместимом протоколе (`PROTOCOL_VERSION`) — потребует.

## Продакшен

Сервер в продакшене сам раздаёт собранный клиент (один процесс, один домен).

```bash
docker build -t mecha .
docker run -p 3000:3000 mecha
```

Переменные окружения:

- `PORT` — порт (по умолчанию 3000)
- `CLIENT_DIST` — папка собранного клиента; если задана, сервер раздаёт статику
- `CORS_ORIGIN` — домен клиента, если он живёт отдельно от сервера

Состояние комнат хранится в памяти процесса: нужен ровно один экземпляр сервера.
