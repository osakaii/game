import { describe, expect, it } from 'vitest';
import type { NetPlayer } from '@mecha/shared';
import { RemotePlayer } from '../../src/player/remote-player';

const noWorld = { colliders: [], obstacles: [] };
const state = (x: number, yaw = 0): NetPlayer => ({ id: 'b', x, y: 0, z: 0, yaw, grounded: true, crouching: false });

describe('RemotePlayer interpolation', () => {
  it('interpolates between two snapshots around render time', () => {
    const player = new RemotePlayer('b', noWorld);
    player.addSample(1000, state(0));
    player.addSample(1050, state(1));
    player.render(1025, 0.016);
    expect(player.model.root.position.x).toBeCloseTo(0.5);
  });

  it('holds the last known position when snapshots are late', () => {
    const player = new RemotePlayer('b', noWorld);
    player.addSample(1000, state(0));
    player.addSample(1050, state(1));
    player.render(1300, 0.016);
    expect(player.model.root.position.x).toBe(1);
  });

  it('ignores out-of-order snapshots', () => {
    const player = new RemotePlayer('b', noWorld);
    player.addSample(1050, state(1));
    player.addSample(1000, state(99));
    player.render(1000, 0.016);
    expect(player.model.root.position.x).toBe(1);
  });

  it('turns through the shortest arc', () => {
    const player = new RemotePlayer('b', noWorld);
    player.addSample(0, state(0, 3.1));
    player.addSample(100, state(0, -3.1));
    player.render(50, 0.016);
    // Середина между 3.1 и -3.1 по короткой дуге — около ±π, а не 0.
    expect(Math.abs(player.model.root.rotation.y)).toBeCloseTo(Math.PI, 1);
  });
});
