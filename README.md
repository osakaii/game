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

Другие команды: `pnpm build`, `pnpm typecheck`.
