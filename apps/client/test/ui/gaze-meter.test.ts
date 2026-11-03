// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { GazeMeter } from '../../src/ui/gaze-meter';

function setup() {
  document.body.innerHTML = '<div id="gaze" hidden><span class="gaze-eye"></span><span id="gaze-count"></span></div>';
  return {
    meter: new GazeMeter(),
    root: document.querySelector<HTMLElement>('#gaze')!,
    count: document.querySelector<HTMLElement>('#gaze-count')!,
  };
}

describe('GazeMeter', () => {
  it('hidden until a seeker looks, then lights up and counts', () => {
    const { meter, root, count } = setup();
    meter.update('seeking', 'hider', false);
    expect(root.hidden).toBe(true);

    meter.onUpdate({ watched: true, points: 0 });
    meter.update('seeking', 'hider', false);
    expect(root.hidden).toBe(false);
    expect(root.classList.contains('watched')).toBe(true);
    expect(count.textContent).toBe('+0');

    // Отвернулись — значок тускнеет, но набранное видно.
    meter.onUpdate({ watched: false, points: 2 });
    meter.update('seeking', 'hider', false);
    expect(root.hidden).toBe(false);
    expect(root.classList.contains('watched')).toBe(false);
    expect(count.textContent).toBe('+2');
  });

  it('only for a hider while seeking', () => {
    const { meter, root } = setup();
    meter.update('seeking', 'hider', false);
    meter.onUpdate({ watched: true, points: 3 });
    meter.update('seeking', 'seeker', false);
    expect(root.hidden).toBe(true);
    meter.update('results', 'hider', false);
    expect(root.hidden).toBe(true);
  });

  it('a found hider keeps the points but is no longer watched', () => {
    const { meter, root, count } = setup();
    meter.update('seeking', 'hider', false);
    meter.onUpdate({ watched: true, points: 4 });
    meter.update('seeking', 'hider', true);
    expect(root.hidden).toBe(false);
    expect(root.classList.contains('watched')).toBe(false);
    expect(count.textContent).toBe('+4');
  });

  it('starts from zero in a new round', () => {
    const { meter, root } = setup();
    meter.onUpdate({ watched: false, points: 5 });
    meter.update('seeking', 'hider', false);
    expect(root.hidden).toBe(false);
    meter.update('lobby', 'hider', false);
    meter.update('seeking', 'hider', false);
    expect(root.hidden).toBe(true);
  });

  it('keeps an update that came before the room (page reloaded mid-round)', () => {
    const { meter, root, count } = setup();
    meter.update(null, null, false);
    meter.onUpdate({ watched: true, points: 10 });
    meter.update(null, null, false);
    meter.update('seeking', 'hider', false);
    expect(root.hidden).toBe(false);
    expect(count.textContent).toBe('+10');
  });

  it('asks to explain the badge once per round, on the first look', () => {
    const { meter } = setup();
    meter.update('seeking', 'hider', false);
    expect(meter.onUpdate({ watched: false, points: 0 })).toBe(false);
    expect(meter.onUpdate({ watched: true, points: 0 })).toBe(true);
    expect(meter.onUpdate({ watched: true, points: 1 })).toBe(false);
    meter.update('hiding', 'hider', false);
    expect(meter.onUpdate({ watched: true, points: 0 })).toBe(true);
  });

  it('marks the round cap', () => {
    const { meter, root } = setup();
    meter.update('seeking', 'hider', false);
    meter.onUpdate({ watched: true, points: 10 });
    meter.update('seeking', 'hider', false);
    expect(root.classList.contains('full')).toBe(true);
  });
});
