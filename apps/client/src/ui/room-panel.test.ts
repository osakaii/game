// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, defaultBodyColors, type PlayerInfo, type RoomSnapshot } from '@mecha/shared';
import { RoomPanel } from './room-panel';

function setup() {
  document.body.innerHTML = `
    <details id="room-panel" hidden>
      <summary><b id="room-panel-code"></b><span id="room-panel-count"></span></summary>
      <button id="room-settings-summary"></button>
      <ul id="player-list"></ul>
      <button id="start-game" hidden></button>
      <button id="invite"></button><button id="leave-room"></button>
    </details>`;
  const handlers = { onLeave: vi.fn(), onInvite: vi.fn(), onStart: vi.fn(), onSettings: vi.fn() };
  return { panel: new RoomPanel(handlers), handlers };
}

const player = (id: string, nickname: string, extra: Partial<PlayerInfo> = {}): PlayerInfo => ({
  id,
  nickname,
  role: null,
  found: false,
  colors: defaultBodyColors(),
  connected: true,
  score: 0,
  roundPoints: 0,
  ...extra,
});

const room = (players: PlayerInfo[]): RoomSnapshot => ({
  code: 'KX7P',
  hostId: players[0].id,
  maxPlayers: 8,
  phase: 'lobby',
  phaseEndsAt: null,
  result: null,
  settings: DEFAULT_SETTINGS,
  round: 0,
  players,
});

describe('RoomPanel', () => {
  it('renders a malicious nickname as text, never as HTML (XSS)', () => {
    const { panel } = setup();
    const evil = '<img src=x onerror="window.hacked=1">';
    panel.render(room([player('a', evil)]), 'a');
    expect(document.querySelector('#player-list img')).toBeNull();
    expect(document.querySelector('#player-list .nickname')!.textContent).toBe(evil);
  });

  it('shows the start button only to the host, enabled with 2+ players', () => {
    const { panel } = setup();
    const start = document.querySelector<HTMLButtonElement>('#start-game')!;

    panel.render(room([player('a', 'A')]), 'a');
    expect(start.hidden).toBe(false);
    expect(start.disabled).toBe(true);

    panel.render(room([player('a', 'A'), player('b', 'B')]), 'a');
    expect(start.disabled).toBe(false);

    panel.render(room([player('a', 'A'), player('b', 'B')]), 'b');
    expect(start.hidden).toBe(true);
  });

  it('marks host, me, offline players and shows scores', () => {
    const { panel } = setup();
    panel.render(room([player('a', 'A', { score: 5 }), player('b', 'B', { connected: false })]), 'b');
    const [host, me] = document.querySelectorAll('#player-list li');
    expect(host.classList.contains('host')).toBe(true);
    expect(host.querySelector('.score')!.textContent).toBe('5');
    expect(me.classList.contains('me')).toBe(true);
    expect(me.classList.contains('offline')).toBe(true);
  });
});
