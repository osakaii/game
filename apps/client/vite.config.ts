import { defineConfig } from 'vite';

export default defineConfig({
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
