/** Цвета названия игры: брызги того же набора, что и кляксы у логотипа. */
const COLORS = ['#ff6b9a', '#ffb648', '#5ee0a0', '#5ab8ff'];
const DROPS = 12;
const DURATION_MS = 550;

/**
 * Брызги краски из кнопки: капли разлетаются от центра и тают. Отклик на главное нажатие —
 * чувствуется, что кнопка сработала, даже пока сервер создаёт комнату.
 * Web Animations API: анимация живёт в JS, после неё капля удаляется — в CSS ничего не копится.
 */
export function paintBurst(from: HTMLElement, random: () => number = Math.random): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = from.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  for (let i = 0; i < DROPS; i++) {
    const drop = document.createElement('span');
    drop.className = 'paint-drop';
    const size = 8 + random() * 10;
    drop.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${COLORS[i % COLORS.length]}`;
    document.body.append(drop);
    // Веером во все стороны, но больше вверх: кнопка в нижнем углу, вниз лететь некуда.
    const angle = (i / DROPS) * Math.PI * 2 + random() * 0.4;
    const reach = box.width * (0.45 + random() * 0.35);
    const dx = Math.cos(angle) * reach;
    const dy = Math.sin(angle) * reach * 0.8 - box.height * 0.4;
    const animation = drop.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 14}px)) scale(0.7)`, opacity: 0 },
      ],
      { duration: DURATION_MS, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
    animation.onfinish = () => drop.remove();
  }
}
