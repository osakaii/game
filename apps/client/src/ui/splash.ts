/**
 * Экран загрузки `#splash` (разметка и стили — прямо в `index.html`, чтобы он был виден до JS-бандла).
 * Пока качаются файлы, полоску ведёт встроенный скрипт страницы; дальше — main.ts этапами:
 * бандл скачан → строим карту → первый кадр (экран уходит).
 */

function parts() {
  const splash = document.getElementById('splash');
  if (!splash) return null;
  return { splash, fill: document.getElementById('splash-fill'), text: document.getElementById('splash-text') };
}

/** Этап загрузки: подпись и доля полоски 0…1. Полоска только растёт — назад не прыгает. */
export function setSplashStage(text: string, progress: number): void {
  const p = parts();
  if (!p) return;
  if (p.text) p.text.textContent = text;
  if (progress <= Number(p.splash.dataset.progress ?? 0)) return;
  p.splash.dataset.progress = String(progress);
  if (p.fill) p.fill.style.width = `${Math.round(progress * 100)}%`;
}

/**
 * Дать браузеру нарисовать новую подпись до тяжёлой синхронной работы (стройка карты):
 * без этого он покажет её уже после — когда она не нужна. В скрытой вкладке кадры не идут — выручает таймер.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
}

/** Первый кадр нарисован — экран тает. Без анимации (prefers-reduced-motion) transitionend не придёт. */
export function hideSplash(): void {
  const p = parts();
  if (!p) return;
  setSplashStage('готово!', 1);
  p.splash.classList.add('hidden');
  const remove = () => p.splash.remove();
  p.splash.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 600);
}
