// @vitest-environment happy-dom
import type { PlayerInfo, RoomSnapshot } from '@mecha/shared';
import { describe, expect, it } from 'vitest';
import { bannerText, PhaseHud } from '../../src/ui/phase-hud';

describe('bannerText', () => {
  it('says what to do now in one or two words', () => {
    expect(bannerText('hiding', 'hider', false, '0:55')).toBe('Прячься · 0:55');
    expect(bannerText('hiding', 'seeker', false, '0:55')).toBe('Глаза закрыты · 0:55');
    expect(bannerText('seeking', 'seeker', false, '2:30')).toBe('Ищи · 2:30');
    expect(bannerText('seeking', 'hider', false, '2:30')).toBe('Не попадись · 2:30');
  });

  it('a found hider watches, a player without a role sees the phase name', () => {
    expect(bannerText('seeking', 'hider', true, '1:20')).toBe('Тебя нашли · 1:20');
    expect(bannerText('hiding', null, false, '0:40')).toBe('Прятки · 0:40');
  });
});

describe('PhaseHud.renderScores', () => {
  const player = (id: string, extra: Partial<PlayerInfo>): PlayerInfo => ({
    id,
    nickname: id,
    role: 'hider',
    found: false,
    skin: { base: 'default', revision: 0, hasImage: false },
    connected: true,
    score: 0,
    roundPoints: 0,
    gazePoints: 0,
    ...extra,
  });

  it('shows gaze points as their own column, only when there are any', () => {
    document.body.innerHTML = `
      <div id="phase-banner"></div><div id="blind"><div id="blind-timer"></div></div>
      <div id="results"><h2 id="results-title"></h2><p id="results-reason"></p><p id="results-timer"></p>
      <ol id="results-scores"></ol></div>`;
    const hud = new PhaseHud();
    const room = {
      phase: 'results',
      players: [player('a', { score: 7, roundPoints: 7, gazePoints: 3 }), player('b', { score: 2, roundPoints: 2 })],
    } as RoomSnapshot;
    hud.renderScores(room, 'a');
    const rows = [...document.querySelectorAll('#results-scores li')];
    expect(rows[0]!.querySelector('.gaze')!.textContent).toBe('👁 3');
    expect(rows[0]!.querySelector('.delta')!.textContent).toBe('+7');
    expect(rows[1]!.querySelector('.gaze')!.textContent).toBe('');
  });
});
