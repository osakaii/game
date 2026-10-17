// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type PlayerInfo, type RoomSnapshot } from '@mecha/shared';
import { LobbyBar } from '../../src/ui/lobby-bar';

function setup() {
  document.body.innerHTML = `
    <div id="lobby-bar" hidden>
      <span id="lobby-status"></span><button id="lobby-invite"></button><button id="start-game" hidden></button>
    </div>`;
  const handlers = { onInvite: vi.fn(), onStart: vi.fn() };
  return { bar: new LobbyBar(handlers), handlers };
}

const player = (id: string, nickname: string): PlayerInfo => ({
  id,
  nickname,
  role: null,
  found: false,
  skin: { base: 'default', revision: 0, hasImage: false },
  connected: true,
  score: 0,
  roundPoints: 0,
});

const room = (players: PlayerInfo[], phase: RoomSnapshot['phase'] = 'lobby'): RoomSnapshot => ({
  code: 'KX7P',
  hostId: players[0].id,
  maxPlayers: 8,
  phase,
  phaseEndsAt: null,
  result: null,
  settings: DEFAULT_SETTINGS,
  round: 0,
  players,
});

const el = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

describe('LobbyBar', () => {
  it('asks to invite while there are not enough players', () => {
    const { bar } = setup();
    bar.render(room([player('a', 'A')]), 'a');
    expect(el('#lobby-bar').hidden).toBe(false);
    expect(el('#start-game').hidden).toBe(true);
    expect(el('#lobby-invite').classList.contains('primary')).toBe(true);
    expect(el('#lobby-status').textContent).toBe('Нужен ещё 1 игрок');
  });

  it('lets the host start once enough players joined', () => {
    const { bar, handlers } = setup();
    bar.render(room([player('a', 'A'), player('b', 'B')]), 'a');
    expect(el('#start-game').hidden).toBe(false);
    expect(el('#lobby-invite').classList.contains('primary')).toBe(false);
    expect(el('#lobby-status').hidden).toBe(true);
    el('#start-game').click();
    expect(handlers.onStart).toHaveBeenCalledOnce();
  });

  it('tells other players who they are waiting for, nickname as text (XSS)', () => {
    const { bar } = setup();
    const evil = '<img src=x onerror="window.hacked=1">';
    bar.render(room([player('a', evil), player('b', 'B')]), 'b');
    expect(el('#start-game').hidden).toBe(true);
    expect(el('#lobby-status').textContent).toBe(`Ждём, когда ${evil} начнёт`);
    expect(document.querySelector('#lobby-bar img')).toBeNull();
  });

  it('hides during a round and outside a room', () => {
    const { bar } = setup();
    bar.render(room([player('a', 'A'), player('b', 'B')], 'hiding'), 'a');
    expect(el('#lobby-bar').hidden).toBe(true);
    bar.render(null, 'a');
    expect(el('#lobby-bar').hidden).toBe(true);
  });
});
