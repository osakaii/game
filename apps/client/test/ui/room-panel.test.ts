// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type PlayerInfo, type RoomSnapshot } from '@mecha/shared';
import { RoomPanel } from '../../src/ui/room-panel';

function setup() {
  document.body.innerHTML = `
    <button id="room-chip" hidden><span id="room-chip-code"></span><span id="room-chip-count"></span></button>
    <div id="room-sheet" hidden>
      <b id="room-sheet-code"></b><button id="room-sheet-close"></button>
      <button id="room-settings-summary"></button>
      <ul id="player-list"></ul>
      <button id="invite"></button>
    </div>`;
  const handlers = { onInvite: vi.fn(), onSettings: vi.fn() };
  return { panel: new RoomPanel(handlers), handlers };
}

const player = (id: string, nickname: string, extra: Partial<PlayerInfo> = {}): PlayerInfo => ({
  id,
  nickname,
  role: null,
  found: false,
  skin: { base: 'default', revision: 0, hasImage: false },
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

  it('shows only the chip until tapped, the sheet opens and closes', () => {
    const { panel } = setup();
    const chip = document.querySelector<HTMLButtonElement>('#room-chip')!;
    const sheet = document.querySelector<HTMLElement>('#room-sheet')!;
    panel.render(room([player('a', 'A'), player('b', 'B')]), 'a');
    expect(chip.hidden).toBe(false);
    expect(document.querySelector('#room-chip-code')!.textContent).toBe('KX7P');
    expect(document.querySelector('#room-chip-count')!.textContent).toBe('2/8');
    expect(sheet.hidden).toBe(true);

    chip.click();
    expect(panel.open).toBe(true);
    // Тап по затемнению мимо шторки закрывает её.
    sheet.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panel.open).toBe(false);
  });

  it('closes the sheet when the round starts and hides everything outside a room', () => {
    const { panel } = setup();
    const lobby = room([player('a', 'A'), player('b', 'B')]);
    panel.render(lobby, 'a');
    panel.setOpen(true);
    panel.render({ ...lobby, phase: 'hiding' }, 'a');
    expect(panel.open).toBe(false);

    panel.setOpen(true);
    panel.render(null, 'a');
    expect(panel.open).toBe(false);
    expect(document.querySelector<HTMLElement>('#room-chip')!.hidden).toBe(true);
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
