/** querySelector с ошибкой вместо null: если вёрстка разошлась с кодом — узнаем сразу, а не через undefined. */
export function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element ${selector} not found`);
  return el;
}

/**
 * localStorage может бросить исключение (приватный режим Safari, запрет cookies).
 * Сохранение ника — удобство, игра не должна из-за него падать.
 */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* без сохранения — не страшно */
    }
  },
};
