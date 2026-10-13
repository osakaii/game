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
});
