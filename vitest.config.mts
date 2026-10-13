import { defineConfig } from 'vitest/config';

// Один запуск тестов на весь монорепо: `pnpm test`.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
  },
});
