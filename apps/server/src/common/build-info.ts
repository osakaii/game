import { APP_VERSION, type BuildInfo } from '@mecha/shared';

/**
 * Какая сборка сервера запущена.
 * Render сам задаёт RENDER_GIT_COMMIT при запуске сервиса. При локальном `docker build`
 * коммит можно передать аргументом (см. Dockerfile) — он попадёт в APP_COMMIT.
 */
/** Момент запуска процесса: по нему клиент узнаёт, что сервер перезапускался. */
export const SERVER_STARTED_AT = Date.now();

export const BUILD_INFO: BuildInfo = {
  version: APP_VERSION,
  commit: (process.env.RENDER_GIT_COMMIT ?? process.env.APP_COMMIT ?? 'dev').slice(0, 7) || 'dev',
};
