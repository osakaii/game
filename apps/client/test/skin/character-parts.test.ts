import { describe, expect, it } from 'vitest';
import { BODY_ZONES } from '@mecha/shared';
import {
  CHARACTER_PARTS,
  PART_ORDER,
  mirrorPart,
  paintMask,
  partIndex,
  partsLinked,
  restCenter,
  restJoint,
} from '../../src/skin/character-parts';
import { gridSteps, roundBoxPoint } from '../../src/skin/rounded-box';

const bit = (part: (typeof PART_ORDER)[number]) => 1 << partIndex(part);

describe('character parts', () => {
  it('uses the shared body zones in the same order (part index travels in skins)', () => {
    expect(PART_ORDER).toEqual(BODY_ZONES);
  });

  it('every radius fits its box', () => {
    for (const part of PART_ORDER) {
      const { size, radius } = CHARACTER_PARTS[part];
      expect(radius, part).toBeGreaterThan(0);
      expect(radius, part).toBeLessThanOrEqual(Math.min(size.w, size.h, size.d) / 2);
    }
  });

  it('is left-right symmetric', () => {
    for (const part of PART_ORDER) {
      const a = restCenter(part);
      const b = restCenter(mirrorPart(part));
      expect(b.x).toBeCloseTo(-a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
      expect(CHARACTER_PARTS[mirrorPart(part)].size).toEqual(CHARACTER_PARTS[part].size);
    }
  });

  it('stands on the ground and is as tall as the physics capsule', () => {
    const foot = CHARACTER_PARTS.footLeft;
    expect(restCenter('footLeft').y - foot.size.h / 2).toBeCloseTo(0, 3);
    expect(restCenter('head').y + CHARACTER_PARTS.head.size.h / 2).toBeCloseTo(1.6, 1);
  });
});

describe('paintMask', () => {
  const knee = restJoint('shinLeft');

  it('paints across the knee: thigh and shin together, no seam', () => {
    const mask = paintMask('thighLeft', { x: knee.x, y: knee.y + 0.03, z: 0.1 }, 0.05);
    expect(mask & bit('thighLeft')).toBeTruthy();
    expect(mask & bit('shinLeft')).toBeTruthy();
  });

  it('does not leak from the torso side onto the arm hanging next to it', () => {
    const side = restCenter('torso');
    const mask = paintMask('torso', { x: CHARACTER_PARTS.torso.size.w / 2, y: side.y - 0.1, z: 0 }, 0.05);
    expect(mask).toBe(bit('torso'));
  });

  it('never paints the other leg', () => {
    const inner = restCenter('thighLeft');
    const mask = paintMask('thighLeft', { x: inner.x + 0.1, y: inner.y, z: 0 }, 0.1);
    expect(mask & bit('thighRight')).toBe(0);
  });

  it('knows which parts a stroke can cross continuously', () => {
    expect(partsLinked('thighLeft', 'shinLeft')).toBe(true);
    expect(partsLinked('torso', 'thighRight')).toBe(true);
    expect(partsLinked('forearmLeft', 'torso')).toBe(false);
  });
});

describe('rounded box', () => {
  const size = { w: 0.4, h: 0.6, d: 0.3 };

  it('keeps the middle of a face where it was', () => {
    const { point, normal } = roundBoxPoint({ x: 0, y: 0, z: 0.15 }, size, 0.1);
    expect(point.z).toBeCloseTo(0.15, 6);
    expect(normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('rolls a corner onto the sphere of the rounding', () => {
    const { point, normal } = roundBoxPoint({ x: 0.2, y: 0.3, z: 0.15 }, size, 0.1);
    const inner = { x: 0.1, y: 0.2, z: 0.05 };
    expect(Math.hypot(point.x - inner.x, point.y - inner.y, point.z - inner.z)).toBeCloseTo(0.1, 6);
    expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 6);
  });

  it('places grid steps densely in the rounded bands', () => {
    const steps = gridSteps(0.6, 0.1);
    expect(steps[0]).toBe(0);
    expect(steps.at(-1)).toBe(1);
    expect(steps.every((t, i) => i === 0 || t > steps[i - 1])).toBe(true);
    expect(steps.filter((t) => t < 0.1 / 0.6 + 1e-9).length).toBeGreaterThanOrEqual(4);
  });
});
