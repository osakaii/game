// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus } from '../../src/net/network';
import { MenuScreen } from '../../src/ui/menu-screen';

const ONLINE: ConnectionStatus = { state: 'online', text: 'в сети', retrying: true };
const CONNECTING: ConnectionStatus = { state: 'connecting', text: 'подключаемся…', retrying: true };

function setup(initialCode: string | null = null) {
  document.body.innerHTML = `
    <div id="menu">
      <form id="menu-form">
        <button type="button" id="menu-settings"></button>
        <input id="nickname" />
        <p id="menu-status"><span id="menu-status-text"></span></p>
        <p id="menu-error"></p>
        <button type="button" id="menu-alt">По коду</button>
        <button type="button" id="menu-play"><span id="menu-play-label">Играть</span><small id="menu-play-hint">новая комната</small></button>
        <div id="join-sheet" hidden>
          <input id="room-code" /><p id="join-error"></p>
          <button type="button" id="join-cancel"></button><button type="submit" id="join-room"></button>
        </div>
      </form>
    </div>`;
  const handlers = { onCreate: vi.fn(), onJoin: vi.fn(), onSettings: vi.fn() };
  const menu = new MenuScreen(handlers, initialCode);
  menu.setConnection(ONLINE);
  return { menu, handlers };
}

const el = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const type = (selector: string, value: string) => {
  el<HTMLInputElement>(selector).value = value;
  el(selector).dispatchEvent(new Event('input'));
};

describe('MenuScreen', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('«Играть» creates a room; an empty nickname is an error next to the buttons', () => {
    const { handlers } = setup();
    el('#menu-play').click();
    expect(handlers.onCreate).not.toHaveBeenCalled();
    expect(el('#menu-error').textContent).not.toBe('');
    type('#nickname', 'Аня');
    el('#menu-play').click();
    expect(handlers.onCreate).toHaveBeenCalledWith('Аня');
  });

  it('«По коду» opens the sheet; a wrong code is shown inside the sheet, not behind it', () => {
    const { menu, handlers } = setup();
    type('#nickname', 'Аня');
    el('#menu-alt').click();
    expect(el('#join-sheet').hidden).toBe(false);
    type('#room-code', 'ab2c');
    expect(el<HTMLInputElement>('#room-code').value).toBe('AB2C');
    el<HTMLFormElement>('#menu-form').requestSubmit();
    expect(handlers.onJoin).toHaveBeenCalledWith('Аня', 'AB2C');
    // Сервер ответил ошибкой (lobby → menu.showError) — она в шторке.
    menu.showError('Комната не найдена');
    expect(el('#join-error').textContent).toBe('Комната не найдена');
    expect(el('#menu-error').textContent).toBe('');
    el('#join-cancel').click();
    expect(el('#join-sheet').hidden).toBe(true);
    expect(el('#join-error').textContent).toBe('');
  });

  it('an invite link makes the main button join the friend, own room becomes secondary', () => {
    const { handlers } = setup('QWER');
    type('#nickname', 'Боря');
    expect(el('#menu-play-label').textContent).toBe('Войти');
    expect(el('#menu-play-hint').textContent).toContain('QWER');
    el('#menu-play').click();
    expect(handlers.onJoin).toHaveBeenCalledWith('Боря', 'QWER');
    el('#menu-alt').click();
    expect(handlers.onCreate).toHaveBeenCalledWith('Боря');
  });

  it('buttons wait for the connection and say what they wait for', () => {
    vi.useFakeTimers();
    const { menu } = setup('QWER');
    expect(el('#menu-status').hidden).toBe(true);
    menu.setConnection(CONNECTING);
    expect(el<HTMLButtonElement>('#menu-play').disabled).toBe(true);
    expect(el<HTMLButtonElement>('#menu-alt').disabled).toBe(true);
    expect(el('#menu-status').hidden).toBe(false);
    expect(el('#menu-status-text').textContent).toBe('Подключаемся к серверу…');
    expect(el('#menu-play-hint').textContent).toBe('ждём сервер');
    // Сервер долго молчит — подпись сама сменится, хотя от сети событий нет: Render будит сервер.
    vi.advanceTimersByTime(6000);
    expect(el('#menu-status-text').textContent).toContain('просыпается');
    menu.setConnection(ONLINE);
    expect(el<HTMLButtonElement>('#menu-play').disabled).toBe(false);
    expect(el('#menu-status').hidden).toBe(true);
    // Подсказка кнопки — прежняя, приглашение не потерялось.
    expect(el('#menu-play-hint').textContent).toBe('в комнату QWER');
  });

  it('a hopeless wait (other tab) shows the network text, not «waking up»', () => {
    vi.useFakeTimers();
    const { menu } = setup();
    menu.setConnection({ state: 'offline', text: 'игра открыта в другой вкладке', retrying: false });
    vi.advanceTimersByTime(60_000);
    expect(el('#menu-status-text').textContent).toBe('Игра открыта в другой вкладке');
  });

  it('the main screen hides the game controls', () => {
    const { menu } = setup();
    expect(document.body.classList.contains('menu-open')).toBe(true);
    menu.hide();
    expect(document.body.classList.contains('menu-open')).toBe(false);
  });

  it('the gear opens the settings', () => {
    const { handlers } = setup();
    el('#menu-settings').click();
    expect(handlers.onSettings).toHaveBeenCalled();
  });
});
