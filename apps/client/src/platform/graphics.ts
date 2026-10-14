import { storage } from '../ui/dom';

const SHADOWS_KEY = 'mecha:shadows';

/**
 * Настройки графики. Тени — самое дорогое в рендере: сцена рисуется второй раз с точки зрения солнца.
 * На слабом телефоне их можно выключить — тогда под персонажами остаются дешёвые круглые тени.
 */
export const graphics = {
  shadows: storage.get(SHADOWS_KEY) !== '0',
};

export function setShadowsEnabled(enabled: boolean): void {
  graphics.shadows = enabled;
  storage.set(SHADOWS_KEY, enabled ? '1' : '0');
}
