const KEY = 'mecha:session';

/**
 * Секрет сессии этой вкладки. sessionStorage, а не localStorage:
 * - переживает перезагрузку страницы (вернёмся в ту же комнату);
 * - у каждой вкладки свой (две вкладки = два разных игрока, удобно тестировать).
 */
export function getSessionId(): string {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  } catch {
    /* хранилище недоступно — будет новая сессия на каждую загрузку */
  }
  const id = randomId();
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* см. выше */
  }
  return id;
}

/**
 * crypto.randomUUID() работает только в secure context (https/localhost),
 * а с телефона по http://192.168.x.x его нет. getRandomValues доступен везде.
 */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
