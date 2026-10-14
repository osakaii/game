import { defineConfig } from 'vitest/config';

// Один запуск тестов на весь монорепо: `pnpm test`.
// Тесты лежат в test/ каждого пакета и повторяют структуру src/: src/skin/atlas.ts -> test/skin/atlas.test.ts.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
});
