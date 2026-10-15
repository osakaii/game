// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShotFx } from '../../src/world/shot-fx';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const forward = v(0, 0, -1);

function run(fx: ShotFx, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) fx.update(1 / 60);
}

describe('ShotFx', () => {
  it('own shot: no impact until the server confirms, then at the server point', () => {
    const fx = new ShotFx(new THREE.Scene());
    const onImpact = vi.fn();
    fx.onImpact = onImpact;
    fx.fireOwn(v(0, 1, 0), v(0, 1, -5), forward);
    run(fx, 0.3); // долетела до предсказанной точки, но сервер молчит
    expect(onImpact).not.toHaveBeenCalled();

    fx.confirmOwn(v(0.5, 0.2, -4), true);
    run(fx, 0.05);
    expect(onImpact).toHaveBeenCalledOnce();
    expect(onImpact.mock.calls[0][0].point.toArray()).toEqual([0.5, 0.2, -4]);
    expect(onImpact.mock.calls[0][0].hit).toBe(true);
  });

  it('server corrects the target mid-flight: the blob lands where the server says', () => {
    const fx = new ShotFx(new THREE.Scene());
    const onImpact = vi.fn();
    fx.onImpact = onImpact;
    const shot = fx.fireOwn(v(0, 1, 0), v(0, 1, -12), forward);
    fx.update(1 / 60);
    fx.confirmOwn(v(0, 0, -3), false); // на самом деле краска упала на пол ближе
    run(fx, 0.5);
    expect(shot.done).toBe(true);
    expect(onImpact.mock.calls[0][0].point.toArray()).toEqual([0, 0, -3]);
  });

  it('a refused shot fizzles without a splat', () => {
    const fx = new ShotFx(new THREE.Scene());
    const onImpact = vi.fn();
    fx.onImpact = onImpact;
    const shot = fx.fireOwn(v(0, 1, 0), v(0, 1, -5), forward);
    fx.cancelOwn(shot);
    run(fx, 0.5);
    expect(shot.done).toBe(true);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('server silence: the blob gives up after a timeout, no splat', () => {
    const fx = new ShotFx(new THREE.Scene());
    const onImpact = vi.fn();
    fx.onImpact = onImpact;
    const shot = fx.fireOwn(v(0, 1, 0), v(0, 1, -2), forward);
    run(fx, 1.5);
    expect(shot.done).toBe(true);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('confirmations match own shots in firing order', () => {
    const fx = new ShotFx(new THREE.Scene());
    const points: number[] = [];
    fx.onImpact = (impact) => points.push(impact.point.z);
    fx.fireOwn(v(0, 1, 0), v(0, 1, -5), forward);
    fx.fireOwn(v(0, 1, 0), v(0, 1, -6), forward);
    fx.confirmOwn(v(0, 0, -1), false);
    fx.confirmOwn(v(0, 0, -2), false);
    run(fx, 0.6);
    expect(points.sort((a, b) => a - b)).toEqual([-2, -1]);
  });

  it("another seeker's shot lands on arrival with the known result", () => {
    const fx = new ShotFx(new THREE.Scene());
    const onImpact = vi.fn();
    fx.onImpact = onImpact;
    fx.fireRemote(v(3, 1, 0), v(0, 0.5, 0), false, v(-1, 0, 0));
    run(fx, 0.4);
    expect(onImpact).toHaveBeenCalledOnce();
  });
});
