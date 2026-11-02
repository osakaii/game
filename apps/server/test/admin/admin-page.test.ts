// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_PAGE } from '../../src/admin/admin-page';
import type { AdminStats } from '../../src/admin/admin-stats.service';

const day = (d: string, players: number) => ({ day: d, visitors: players + 1, players, newPlayers: 1, rooms: 1, rounds: players });

const STATS: AdminStats = {
  from: '2026-11-01',
  to: '2026-11-02',
  days: 2,
  total: { ...day('total', 3), visitors: 7 },
  daily: [day('2026-11-01', 1), day('2026-11-02', 2)],
  nicknames: [{ nickname: '<img src=x onerror="window.pwned=1">', entries: 2, devices: 1, lastAt: '2026-11-02T02:00:00.000Z' }],
  maps: [{ map: 'castle', name: 'Замок', rounds: 4, hiderWins: 3, seekerWins: 1, avgSeconds: 185, avgPlayers: 4 }],
  results: [{ winner: 'hider', reason: 'time_up', rounds: 3 }],
  devices: [{ device: 'ios', players: 2 }],
};

/** Запустить страницу как в браузере: разметка в документ, скрипт — отдельно (innerHTML скрипты не исполняет). */
async function open(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  const doc = new DOMParser().parseFromString(ADMIN_PAGE, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  const script = doc.querySelector('script')!.textContent!;
  new Function(script)();
  await vi.waitFor(() => expect(document.getElementById('app')!.hidden && document.getElementById('login')!.hidden).toBe(false));
}

describe('admin page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('without a key asks for it and does not call the API', async () => {
    const fetchSpy = vi.fn();
    await open(fetchSpy);
    expect(document.getElementById('login')!.hidden).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the numbers; a nickname with HTML stays text', async () => {
    localStorage.setItem('mecha:admin-key', 'k');
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(STATS), { status: 200 }));
    await open(fetchSpy as unknown as typeof fetch);
    await vi.waitFor(() => expect(document.querySelector('#nicknames td')).not.toBeNull());

    expect(fetchSpy).toHaveBeenCalledWith('/stats/admin/api?days=14', expect.objectContaining({ headers: { 'X-Admin-Key': 'k' } }));
    expect(document.getElementById('tiles')!.textContent).toContain('Играли3');
    expect(document.getElementById('maps')!.textContent).toContain('Замок');
    expect(document.getElementById('maps')!.textContent).toContain('3:05');
    expect(document.getElementById('nicknames')!.textContent).toContain('<img src=x');
    expect(document.querySelector('#nicknames img')).toBeNull();
    expect(document.querySelectorAll('#chart rect')).toHaveLength(4);
  });

  it('a wrong key is forgotten and the login form comes back', async () => {
    localStorage.setItem('mecha:admin-key', 'bad');
    await open((async () => new Response('{}', { status: 401 })) as unknown as typeof fetch);
    await vi.waitFor(() => expect(document.getElementById('login-error')!.textContent).toBe('Неверный ключ'));
    expect(localStorage.getItem('mecha:admin-key')).toBeNull();
  });

  it('never writes HTML from data', () => {
    expect(ADMIN_PAGE).not.toContain('innerHTML');
    expect(ADMIN_PAGE).not.toContain('insertAdjacentHTML');
  });
});
