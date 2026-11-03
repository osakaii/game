import { describe, expect, it } from 'vitest';
import { CLIENT_STATE_RATE, vec3, type PlayerState } from '@mecha/shared';
import type { LocalPlayer } from '../../src/player/local-player';
import { StateSender } from '../../src/net/state-sender';

/** Игрок, стоящий на месте: StateSender читает только state и facing. */
const player = {
  state: { position: vec3(1, 0, 2), velocity: vec3(), grounded: true, crouching: false, pose: 'none' },
  facing: 0,
} as unknown as LocalPlayer;
const STEP = 1 / CLIENT_STATE_RATE;

describe('StateSender', () => {
  it('sends no look for a hider', () => {
    const sent: PlayerState[] = [];
    new StateSender((s) => sent.push(s)).update(STEP, player);
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty('look');
  });

  it('a seeker sends where the camera looks, rounded like positions', () => {
    const sent: PlayerState[] = [];
    new StateSender((s) => sent.push(s)).update(STEP, player, { yaw: 1.23456, pitch: 0.34567 });
    expect(sent[0]!.look).toEqual({ yaw: 1.23, pitch: 0.35 });
  });

  it('turning the camera while standing still is news: the server counts the gaze from it', () => {
    const sent: PlayerState[] = [];
    const sender = new StateSender((s) => sent.push(s));
    sender.update(STEP, player, { yaw: 0, pitch: 0.3 });
    sender.update(STEP, player, { yaw: 0, pitch: 0.3 });
    expect(sent).toHaveLength(1);
    sender.update(STEP, player, { yaw: 0.5, pitch: 0.3 });
    expect(sent).toHaveLength(2);
  });
});
