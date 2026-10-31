import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS } from '@mecha/shared';
import { defineConfig } from 'vite';
import { serviceWorker } from './build/sw-plugin.ts';

/**
 * Хэш коммита, из которого собран клиент. В Docker папки .git нет — тогда берём из переменной окружения.
 * Нет ни того, ни другого — 'dev'.
 */
function buildCommit(): string {
  const fromEnv = process.env.GIT_COMMIT ?? process.env.RENDER_GIT_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // Service worker: после сборки пишет dist/sw.js со списком файлов этой сборки. Карты комнат не
  // качает заранее (грузятся при входе), кроме карты главного экрана — чанк называется как её id.
  plugins: [serviceWorker(fileURLToPath(new URL('./src/pwa/sw.js', import.meta.url)), [DEFAULT_SETTINGS.mapId])],
  // define подставляет значения прямо в код при сборке: в бандле будет строка, а не переменная.
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
  },
  server: {
    // Открыть dev-сервер в локальной сети — заходим с телефона по IP компьютера.
    host: true,
    port: 5173,
    proxy: {
      // Клиент подключается к своему же origin, Vite пробрасывает сокет на Nest.
      // Так не нужен CORS и не надо знать IP сервера на телефоне.
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Библиотеки — в отдельные файлы. Они меняются редко, а наш код — при каждом деплое.
        // После обновления игры браузер перекачает только маленький чанк приложения,
        // а three.js (~600 KB) возьмёт из кэша.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
    // three.js сам по себе больше 500 KB — это ожидаемо, предупреждение не информативно.
    chunkSizeWarningLimit: 700,
  },
});
