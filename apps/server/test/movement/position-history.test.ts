import { describe, expect, it } from 'vitest';
import { PositionHistory } from '../../src/movement/position-history';

const pos = (x: number, crouching = false) => ({ x, y: 0, z: 0, crouching });

describe('PositionHistory', () => {
  it('interpolates between recorded positions', () => {
    const h = new PositionHistory();
    h.push(1000, pos(0));
    h.push(1050, pos(1));
    expect(h.at(1025)?.x).toBeCloseTo(0.5);
  });

  it('clamps to the oldest and newest record', () => {
    const h = new PositionHistory();
    h.push(1000, pos(0));
    h.push(1050, pos(1));
    expect(h.at(500)?.x).toBe(0);
    expect(h.at(9999)?.x).toBe(1);
  });

  it('keeps a bounded window', () => {
    const h = new PositionHistory();
    for (let i = 0; i < 100; i++) h.push(i * 50, pos(i));
    expect(h.at(0)?.x).toBe(76); // старые записи вытеснены
  });

  it('prefers the newest record when timestamps are equal', () => {
    const h = new PositionHistory();
    h.push(1000, pos(0));
    h.push(1000, pos(5, true));
    expect(h.at(1000)).toMatchObject({ x: 5, crouching: true });
  });

  it('keeps the pose of the nearest record (a pose is not a number)', () => {
    const h = new PositionHistory();
    h.push(1000, { ...pos(0), pose: 'none' });
    h.push(1100, { ...pos(1), pose: 'flat' });
    expect(h.at(1020)?.pose).toBe('none');
    expect(h.at(1080)?.pose).toBe('flat');
  });

  it('returns null when empty', () => {
    expect(new PositionHistory().at(0)).toBeNull();
  });
});
