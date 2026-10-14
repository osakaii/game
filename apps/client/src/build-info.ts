import { APP_VERSION, type BuildInfo } from '@mecha/shared';

/** Подставляется Vite при сборке (vite.config.ts → define). */
declare const __BUILD_COMMIT__: string | undefined;

/**
 * Какая сборка загружена в браузер. typeof-проверка — для тестов,
 * там код не проходит через Vite и константы нет.
 */
export const CLIENT_BUILD: BuildInfo = {
  version: APP_VERSION,
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev',
};

export function formatBuild(build: BuildInfo): string {
  return build.commit === 'dev' ? `v${build.version}` : `v${build.version} · ${build.commit}`;
}
