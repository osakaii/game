// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MapId, type RoomSnapshot } from '@mecha/shared';
import { MapPicker } from '../../src/ui/map-picker';

function setup() {
  document.body.innerHTML = `
    <button id="lobby-map" hidden><b id="lobby-map-name"></b></button>
    <div id="map-picker" hidden><button id="map-picker-close"></button><div id="map-options"></div></div>`;
  const onPick = vi.fn<(mapId: MapId) => void>();
  return { picker: new MapPicker(onPick), onPick };
}

const room = (mapId: MapId = 'ala-too', phase: RoomSnapshot['phase'] = 'lobby'): RoomSnapshot => ({
  code: 'KX7P',
  hostId: 'a',
  maxPlayers: 8,
  phase,
  phaseEndsAt: null,
  result: null,
  settings: { ...DEFAULT_SETTINGS, mapId },
  round: 0,
  players: [],
});

const el = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const option = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.map-option')].find((b) => b.textContent!.includes(name))!;

describe('MapPicker', () => {
  it('shows the map under the lobby bar, with each map and its seek time in the picker', () => {
    const { picker } = setup();
    picker.render(room('supermarket'), true);
    expect(el('#lobby-map').hidden).toBe(false);
    expect(el('#lobby-map-name').textContent).toBe('Супермаркет');
    expect(document.querySelectorAll('.map-option')).toHaveLength(6);
    expect(option('Супермаркет').textContent).toContain('поиск 5:00');
    expect(option('Супермаркет').getAttribute('aria-pressed')).toBe('true');
    expect(option('Квартира').getAttribute('aria-pressed')).toBe('false');
  });

  it('lets the host pick another map in two taps', () => {
    const { picker, onPick } = setup();
    picker.render(room(), true);
    el('#lobby-map').click();
    expect(el('#map-picker').hidden).toBe(false);
    option('Супермаркет').click();
    expect(onPick).toHaveBeenCalledWith('supermarket');
    expect(el('#map-picker').hidden).toBe(true);
  });

  it('does not resend the map that is already chosen', () => {
    const { picker, onPick } = setup();
    picker.render(room(), true);
    option('Ала-Тоо').click();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('is only a label for other players', () => {
    const { picker } = setup();
    picker.render(room(), false);
    expect(el<HTMLButtonElement>('#lobby-map').disabled).toBe(true);
    expect(el('#lobby-map').classList.contains('editable')).toBe(false);
  });

  it('hides once the round starts and closes an open picker', () => {
    const { picker } = setup();
    picker.render(room(), true);
    el('#lobby-map').click();
    picker.render(room('ala-too', 'hiding'), true);
    expect(el('#lobby-map').hidden).toBe(true);
    expect(el('#map-picker').hidden).toBe(true);
  });
});
