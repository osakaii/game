# syntax=docker/dockerfile:1

# ---------- Сборка ----------
# Многоэтапная сборка: компиляторы и dev-зависимости остаются в этом слое,
# в финальный образ попадает только то, что нужно для запуска.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

# Сначала только манифесты: пока зависимости не менялись, Docker берёт `pnpm install` из кэша
# и не переустанавливает всё при каждой правке кода.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
# Сервер + его production-зависимости (включая собранный @mecha/shared) в отдельную папку.
RUN pnpm --filter @mecha/server deploy --prod --legacy /out/server

# ---------- Запуск ----------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIST=/app/client
WORKDIR /app
COPY --from=build /out/server ./server
COPY --from=build /app/apps/client/dist ./client

# Не запускаем под root: если в приложении найдут дыру, у атакующего будет меньше прав.
USER node
EXPOSE 3000
# Shell-форма команды — чтобы подставился $PORT (Render задаёт свой порт через переменную).
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://localhost:${PORT}/health" || exit 1
CMD ["node", "server/dist/main.js"]
