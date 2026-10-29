import { describe, expect, it, vi } from 'vitest';
import { ALA_TOO, PLAYROOM } from '@mecha/shared';
import { MenuShowcase, showcasePose, showcaseSpot } from '../../src/world/menu-showcase';
import type { StudioCamera } from '../../src/paint/studio-camera';

describe('main-screen showcase', () => {
  it('stands, then shows a hiding pose, then stands again, going through different poses', () => {
    expect(showcasePose(0)).toBe('none');
    expect(showcasePose(3.9)).toBe('none');
    const first = showcasePose(5);
    const second = showcasePose(12);
    expect(first).not.toBe('none');
    expect(second).not.toBe('none');
    expect(second).not.toBe(first);
    expect(showcasePose(8)).toBe('none');
  });

  it('uses the map’s own spot, or the first spawn', () => {
    expect(showcaseSpot(ALA_TOO)).toBe(ALA_TOO.showcase);
    expect(showcaseSpot(PLAYROOM).position).toBe(PLAYROOM.spawns[0]);
  });

  it('resets the pose on start and on stop, and only reports pose changes', () => {
    const view = { yaw: 0, pitch: 0, distance: 0, screenShift: 0, update: vi.fn() } as unknown as StudioCamera;
    const setPose = vi.fn();
    const showcase = new MenuShowcase(view, setPose);
    showcase.start(0);
    expect(setPose).toHaveBeenLastCalledWith('none');
    const target = { x: 0, y: 0, z: 0 } as never;
    for (let i = 0; i < 60; i++) showcase.update(0.1, target); // 6 с — уже поза
    expect(setPose).toHaveBeenCalledTimes(2);
    expect(setPose.mock.lastCall?.[0]).not.toBe('none');
    // Камера ходит перед персонажем, а не за спину.
    expect(Math.abs(view.yaw)).toBeLessThanOrEqual(0.5);
    showcase.stop();
    expect(setPose).toHaveBeenLastCalledWith('none');
    expect(showcase.active).toBe(false);
  });
});
