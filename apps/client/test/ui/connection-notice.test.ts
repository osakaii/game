import { describe, expect, it } from 'vitest';
import type { ConnectionStatus } from '../../src/net/network';
import { GIVE_UP_HINT_MS, WAKE_HINT_MS, connectionNotice } from '../../src/ui/connection-notice';

const status = (state: ConnectionStatus['state'], retrying = true, text = 'подключаемся…'): ConnectionStatus => ({
  state,
  text,
  retrying,
});

describe('connectionNotice', () => {
  it('says nothing when online', () => {
    expect(connectionNotice(status('online'), 0)).toBeNull();
    expect(connectionNotice(status('online'), GIVE_UP_HINT_MS * 2)).toBeNull();
  });

  it('connecting → waking the server → giving up, by waiting time', () => {
    expect(connectionNotice(status('connecting'), 0)).toBe('Подключаемся к серверу…');
    expect(connectionNotice(status('offline'), WAKE_HINT_MS - 1)).toBe('Подключаемся к серверу…');
    expect(connectionNotice(status('offline'), WAKE_HINT_MS)).toContain('просыпается');
    expect(connectionNotice(status('connecting'), GIVE_UP_HINT_MS)).toContain('не отвечает');
  });

  it('no internet on the phone is not «the server is asleep»', () => {
    expect(connectionNotice(status('offline'), WAKE_HINT_MS * 3, false)).toBe('Нет интернета — проверь связь');
  });

  it('a hopeless state shows the network text as is', () => {
    expect(connectionNotice(status('offline', false, 'нужно обновить страницу'), 0)).toBe('Нужно обновить страницу');
  });
});
