import { storage } from '../ui/dom';

const SHADOWS_KEY = 'mecha:shadows';

/**
 * Настройки графики. Тени — самое дорогое в рендере: сцена рисуется второй раз с точки зрения солнца.
 * На слабом телефоне их можно выключить — тогда под персонажами остаются дешёвые круглые тени.
 */
export const graphics = {
  shadows: storage.get(SHADOWS_KEY) !== '0',
  /**
   * Только для разработки: принудительно 8-битный мокрый слой — так на компьютере проверяется
   * запасной режим слабых телефонов. Включить: localStorage['mecha:wet8bit'] = '1' и перезагрузить.
   */
  forceWetEightBit: import.meta.env.DEV && storage.get('mecha:wet8bit') === '1',
};

export function setShadowsEnabled(enabled: boolean): void {
  graphics.shadows = enabled;
  storage.set(SHADOWS_KEY, enabled ? '1' : '0');
}
