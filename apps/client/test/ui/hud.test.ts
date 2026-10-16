// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Hud, SLOW_PING_MS } from '../../src/ui/hud';

function setup(debug: boolean) {
  document.body.innerHTML = `
    <div id="hud"><span id="status"></span><span id="ping"></span><span id="fps"></span><span id="hud-version"></span></div>`;
  return new Hud(debug);
}

describe('Hud', () => {
  it('stays quiet for players unless debugging', () => {
    setup(false);
    expect(document.querySelector('#hud')!.classList.contains('debug')).toBe(false);
    setup(true);
    expect(document.querySelector('#hud')!.classList.contains('debug')).toBe(true);
  });

  it('flags a slow ping so it shows up for players', () => {
    const hud = setup(false);
    const ping = document.querySelector('#ping')!;
    hud.setPing(80);
    expect(ping.classList.contains('slow')).toBe(false);
    hud.setPing(SLOW_PING_MS + 40);
    expect(ping.classList.contains('slow')).toBe(true);
    expect(ping.textContent).toBe(`пинг ${SLOW_PING_MS + 40} мс`);
  });

  it('marks the connection state for styling', () => {
    const hud = setup(false);
    hud.setStatus('offline', 'нет связи, переподключаемся…');
    expect((document.querySelector('#status') as HTMLElement).dataset.state).toBe('offline');
  });
});
