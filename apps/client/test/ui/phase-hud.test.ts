import { describe, expect, it } from 'vitest';
import { bannerText } from '../../src/ui/phase-hud';

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
