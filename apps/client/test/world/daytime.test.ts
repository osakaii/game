import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DAYTIMES } from '@mecha/shared';
import { Atmosphere, DAYTIME_LOOKS, sunDirection } from '../../src/world/daytime';

function context() {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  const hemisphere = new THREE.HemisphereLight();
  scene.add(sun, sun.target, hemisphere);
  return { scene, sun, hemisphere };
}

describe('daytime', () => {
  it.each(DAYTIMES)('%s: солнце над горизонтом, но не в зените — тени видны', (daytime) => {
    const look = DAYTIME_LOOKS[daytime];
    expect(look.sunElevation).toBeGreaterThanOrEqual(10);
    expect(look.sunElevation).toBeLessThanOrEqual(60);
    expect(sunDirection(look).length()).toBeCloseTo(1, 6);
  });

  it.each(DAYTIMES)('%s: света хватает, чтобы различать цвета (ночи нет)', (daytime) => {
    const look = DAYTIME_LOOKS[daytime];
    const ambient = new THREE.Color(look.skyLight).multiplyScalar(look.ambient);
    // Рассеянный свет сверху — главный в тени; без него маскировку в тени не разглядеть.
    expect((ambient.r + ambient.g + ambient.b) / 3).toBeGreaterThan(0.8);
  });

  it('применяет солнце, рассеянный свет и пересчитывает тени только при смене', () => {
    const ctx = context();
    const onSunMoved = vi.fn();
    const atmosphere = new Atmosphere(ctx, onSunMoved);
    expect(ctx.scene.children).toContain(atmosphere.sky.mesh);

    expect(atmosphere.apply('sunset')).toBe(true);
    const look = DAYTIME_LOOKS.sunset;
    expect(ctx.sun.color.getHexString()).toBe(new THREE.Color(look.sunColor).getHexString());
    expect(ctx.hemisphere.intensity).toBe(look.ambient);
    const toSun = ctx.sun.position.clone().sub(ctx.sun.target.position).normalize();
    expect(toSun.distanceTo(sunDirection(look))).toBeLessThan(1e-6);
    expect(onSunMoved).toHaveBeenCalledTimes(1);

    expect(atmosphere.apply('sunset')).toBe(false);
    expect(onSunMoved).toHaveBeenCalledTimes(1);
    atmosphere.apply('dusk');
    expect(atmosphere.daytime).toBe('dusk');
    expect(onSunMoved).toHaveBeenCalledTimes(2);
  });
});
