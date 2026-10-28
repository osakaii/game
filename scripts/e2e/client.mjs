// Общие помощники e2e: настоящий socket.io-клиент против запущенного сервера (по умолчанию — собранный dist).
import { io } from 'socket.io-client';

export const URL = process.env.E2E_URL ?? 'http://localhost:3000';

/** Подключиться новым игроком. sessionId — секрет сессии (16–64 символа [A-Za-z0-9_-]). */
export async function connect(name) {
  const socket = io(URL, {
    auth: { sessionId: `e2e-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    transports: ['websocket'],
    reconnection: false,
  });
  const welcome = await waitFor(socket, 'net:welcome');
  return { socket, welcome };
}

/** Запрос с ack (как Network.request на клиенте): ответ `Result<T>`. */
export function request(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event}: no ack in 5 s`)), 5000);
    socket.emit(event, ...args, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

/** Дождаться события (и условия на его данные). */
export function waitFor(socket, event, accept = () => true, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event}: not received in ${timeoutMs} ms`));
    }, timeoutMs);
    function handler(data) {
      if (!accept(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }
    socket.on(event, handler);
  });
}
