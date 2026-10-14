// @vitest-environment happy-dom
// Комментарий выше переключает этот файл на эмуляцию браузера: есть document, window, PointerEvent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controls } from './controls';

function setup() {
  document.body.innerHTML = `
    <canvas id="scene"></canvas>
    <div id="joystick" hidden><div id="joystick-knob"></div></div>
    <button id="jump-button"></button>
    <button id="crouch-button"></button>`;
  const q = (s: string) => document.querySelector<HTMLElement>(s)!;
  const canvas = q('#scene');
  const controls = new Controls({
    surface: canvas,
    joystickBase: q('#joystick'),
    joystickKnob: q('#joystick-knob'),
    jumpButton: q('#jump-button'),
    crouchButton: q('#crouch-button'),
  });
  const pointer = (type: string, id: number, x: number, y: number, pointerType = 'touch') =>
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType, clientX: x, clientY: y, bubbles: true }));
  return { controls, pointer, q };
}

describe('Controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.innerWidth = 1000;
  });
  afterEach(() => vi.useRealTimers());

  it('a short tap on the right side is a tap, a drag is camera look', () => {
    const { controls, pointer } = setup();
    const onTap = vi.fn();
    controls.onTap = onTap;

    pointer('pointerdown', 1, 800, 300);
    pointer('pointerup', 1, 802, 301);
    expect(onTap).toHaveBeenCalledWith(802, 301);

    pointer('pointerdown', 2, 800, 300);
    pointer('pointermove', 2, 860, 300);
    pointer('pointerup', 2, 860, 300);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(controls.consumeLook().dx).toBeGreaterThan(0);
  });

  it('a long press is not a tap', () => {
    const { controls, pointer } = setup();
    controls.onTap = vi.fn();
    pointer('pointerdown', 1, 800, 300);
    vi.advanceTimersByTime(500);
    pointer('pointerup', 1, 800, 300);
    expect(controls.onTap).not.toHaveBeenCalled();
  });

  it('a touch on the left side drives the joystick, not taps', () => {
    const { controls, pointer, q } = setup();
    controls.onTap = vi.fn();
    pointer('pointerdown', 1, 100, 400);
    pointer('pointermove', 1, 100, 300); // палец вверх = вперёд
    expect(q('#joystick').hidden).toBe(false);
    expect(controls.moveAxis().y).toBeGreaterThan(0.8);
    pointer('pointerup', 1, 100, 300);
    expect(controls.moveAxis()).toEqual({ x: 0, y: 0 });
    expect(controls.onTap).not.toHaveBeenCalled();
  });

  it('keyboard WASD moves, typing in an input does not', () => {
    const { controls } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(controls.moveAxis().y).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    expect(controls.moveAxis().y).toBe(0);
  });

  it('disabled controls give no movement and swallow jumps', () => {
    const { controls, q } = setup();
    q('#jump-button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    controls.enabled = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    expect(controls.moveAxis()).toEqual({ x: 0, y: 0 });
    expect(controls.consumeJump()).toBe(false);
  });

  it('crouch button toggles and highlights', () => {
    const { controls, q } = setup();
    q('#crouch-button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(controls.crouch).toBe(true);
    expect(q('#crouch-button').classList.contains('active')).toBe(true);
  });
});
