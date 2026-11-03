import * as THREE from 'three';
import type { Daytime } from '@mecha/shared';
import type { SceneContext } from './scene-setup';
import { Sky, type SkyColors } from './sky';

/** Как выглядит время суток: солнце, рассеянный свет и небо. */
export interface DaytimeLook {
  /** Откуда светит солнце: азимут (0 — с +X, 90 — с +Z) и высота над горизонтом, в градусах. */
  sunAzimuth: number;
  sunElevation: number;
  sunColor: string;
  sunIntensity: number;
  /** Рассеянный свет: сверху (небо) и снизу (отражённый от земли). */
  skyLight: string;
  groundLight: string;
  ambient: number;
  sky: SkyColors;
}

/**
 * Свет подобран так, чтобы цвета карты оставались узнаваемыми в любое время: прячущийся подбирает
 * краску пипеткой (цвет материала), и при любом свете она сливается с тем, у чего взята.
 * Солнце не бывает в зените — от низкого солнца тени длиннее и заметнее, мир объёмнее.
 */
export const DAYTIME_LOOKS: Record<Daytime, DaytimeLook> = {
  morning: {
    sunAzimuth: 150,
    sunElevation: 30,
    sunColor: '#ffe0c2',
    sunIntensity: 1.5,
    skyLight: '#eef3ff',
    groundLight: '#8d8072',
    ambient: 1.4,
    sky: {
      zenith: '#3f86dc',
      horizon: '#ffd9c4',
      ground: '#b8a99c',
      sun: '#ffd2a8',
      cloudLight: '#fff4ea',
      cloudShade: '#c4b6c4',
      cloudCover: 0.48,
    },
  },
  day: {
    sunAzimuth: 37,
    sunElevation: 50,
    sunColor: '#fff1dc',
    sunIntensity: 1.6,
    skyLight: '#fff6ea',
    groundLight: '#8a7a66',
    ambient: 1.4,
    sky: {
      zenith: '#3d8de0',
      horizon: '#c4e6ff',
      ground: '#a9b4bd',
      sun: '#fff4d6',
      cloudLight: '#ffffff',
      cloudShade: '#bccbdc',
      cloudCover: 0.5,
    },
  },
  sunset: {
    sunAzimuth: -20,
    sunElevation: 17,
    sunColor: '#ffb27a',
    sunIntensity: 1.7,
    skyLight: '#ffdcc4',
    groundLight: '#7d6474',
    ambient: 1.25,
    sky: {
      zenith: '#4a5ba6',
      horizon: '#ffa577',
      ground: '#8a6f78',
      sun: '#ffb070',
      cloudLight: '#ffc59e',
      cloudShade: '#8c6c90',
      cloudCover: 0.55,
    },
  },
  dusk: {
    sunAzimuth: 215,
    sunElevation: 14,
    sunColor: '#ffa69a',
    sunIntensity: 1.05,
    skyLight: '#c6c4ff',
    groundLight: '#5f5878',
    ambient: 1.35,
    sky: {
      zenith: '#272e66',
      horizon: '#e98fa6',
      ground: '#4e4866',
      sun: '#ff9d8c',
      cloudLight: '#f2a9bb',
      cloudShade: '#4d4878',
      cloudCover: 0.45,
    },
  },
};

/** Единичный вектор «на солнце» по азимуту и высоте. */
export function sunDirection(look: DaytimeLook, target = new THREE.Vector3()): THREE.Vector3 {
  const azimuth = THREE.MathUtils.degToRad(look.sunAzimuth);
  const elevation = THREE.MathUtils.degToRad(look.sunElevation);
  return target.set(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
}

/**
 * Небо и свет сцены. Меняет время суток целиком: солнце (цвет, направление), рассеянный свет и купол неба.
 * Тени запечены — после смены солнца их надо пересчитать: это делает `onSunMoved` (ActiveMap).
 */
export class Atmosphere {
  readonly sky = new Sky();
  private current: Daytime | null = null;

  constructor(
    private readonly context: Pick<SceneContext, 'scene' | 'sun' | 'hemisphere'>,
    private readonly onSunMoved: () => void,
  ) {
    context.scene.add(this.sky.mesh);
  }

  get daytime(): Daytime | null {
    return this.current;
  }

  /** Возвращает true, если время суток сменилось. */
  apply(daytime: Daytime): boolean {
    if (daytime === this.current) return false;
    this.current = daytime;
    const look = DAYTIME_LOOKS[daytime];
    const { sun, hemisphere } = this.context;
    const direction = sunDirection(look);
    sun.color.set(look.sunColor);
    sun.intensity = look.sunIntensity;
    // Расстояние не важно: ActiveMap отодвинет солнце за край карты по этому направлению.
    sun.position.copy(sun.target.position).add(direction);
    hemisphere.color.set(look.skyLight);
    hemisphere.groundColor.set(look.groundLight);
    hemisphere.intensity = look.ambient;
    this.sky.setColors(look.sky, direction);
    this.onSunMoved();
    return true;
  }

  update(dt: number): void {
    this.sky.update(dt);
  }
}
