// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Controls } from '../../src/input/controls';
import { PoseWheel } from '../../src/ui/pose-wheel';

function setup() {
  document.body.innerHTML = `
    <canvas id="scene"></canvas>
    <div id="joystick" hidden><div id="joystick-knob"></div></div>
    <button id="jump-button"></button>
    <button id="crouch-button"></button>
    <button id="pose-button"><span class="pose-icon"></span></button>
    <div id="pose-wheel" hidden><div class="pose-ring"></div></div>`;
  const q = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const controls = new Controls({
    surface: q('#scene'),
    joystickBase: q('#joystick'),
    joystickKnob: q('#joystick-knob'),
    jumpButton: q('#jump-button'),
    crouchButton: q('#crouch-button'),
  });
  const wheel = new PoseWheel(q<HTMLButtonElement>('#pose-button'), q('#pose-wheel'), controls);
  return { controls, wheel, q };
}

describe('PoseWheel', () => {
  it('opens, picks a pose, closes and marks the button', () => {
    const { controls, wheel, q } = setup();
    q('#pose-button').click();
    expect(wheel.open).toBe(true);
    const items = [...document.querySelectorAll<HTMLButtonElement>('.pose-item')];
    expect(items).toHaveLength(7); // «Встать» + 6 поз
    items.find((b) => b.textContent?.includes('Клубок'))!.click();
    expect(controls.pose).toBe('ball');
    expect(wheel.open).toBe(false);
    expect(q('#pose-button').classList.contains('active')).toBe(true);
    expect(q('#pose-button .pose-icon').textContent).toBe('🥚');
  });

  it('follows the pose when the game drops it (player walked off)', () => {
    const { controls, q } = setup();
    controls.setPose('sit');
    controls.setPose('none');
    expect(q('#pose-button').classList.contains('active')).toBe(false);
  });
});
