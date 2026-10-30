/**
 * Версия игры по SemVer: MAJOR.MINOR.PATCH.
 *   MAJOR — несовместимые изменения (старые клиенты не смогут играть с новым сервером);
 *   MINOR — новые возможности без поломок (новая карта, новая настройка);
 *   PATCH — исправления ошибок.
 *
 * Не меняй руками: `pnpm release <major|minor|patch>` обновит её здесь, во всех package.json и в CHANGELOG.
 * Тест version.test.ts проверяет, что все места совпадают.
 */
export const APP_VERSION = '1.5.0';

/** Что за сборка: версия + коммит. Коммит отличает два деплоя одной версии. */
export interface BuildInfo {
  version: string;
  /** Короткий хэш git-коммита или 'dev' для локальной разработки. */
  commit: string;
}

/**
 * Есть ли у сервера сборка новее той, что загружена в браузер.
 * Коммит сравниваем, только если он известен с обеих сторон (в dev-режиме его нет).
 */
export function isUpdateAvailable(client: BuildInfo, server: BuildInfo): boolean {
  if (client.version !== server.version) return true;
  const known = (commit: string) => commit !== 'dev' && commit !== '';
  return known(client.commit) && known(server.commit) && client.commit !== server.commit;
}
