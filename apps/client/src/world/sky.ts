import * as THREE from 'three';
import { seededRandom } from '@mecha/shared';

/** Цвета неба одного времени суток (sky.ts рисует, daytime.ts задаёт). */
export interface SkyColors {
  zenith: string;
  horizon: string;
  /** Ниже горизонта: виден только с крыши у края открытой карты. */
  ground: string;
  sun: string;
  cloudLight: string;
  cloudShade: string;
  /** Доля неба под облаками, 0..1. */
  cloudCover: number;
}

/**
 * Небо: градиент от горизонта к зениту, солнце с ореолом и облака — одним мешем и одним шейдером.
 *
 * Дёшево для телефона: облака не считаются шумом в каждом пикселе, а берутся из готовой текстуры 256²
 * (генерируется один раз). Купол рисуется ПОСЛЕДНИМ из непрозрачного и на дальней плоскости:
 * видеокарта по буферу глубины отбрасывает все пиксели, закрытые картой, — небо считается только там,
 * где его действительно видно (в квартире под потолком — нигде).
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uCloudLight: { value: new THREE.Color() },
        uCloudShade: { value: new THREE.Color() },
        uCloudCover: { value: 0.5 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uClouds: { value: cloudTexture() },
        uDrift: { value: 0 },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      // Камера внутри сферы — видна её внутренняя сторона.
      side: THREE.BackSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), this.material);
    this.mesh.name = 'sky';
    // Купол «прибит» к камере в шейдере — его коробка не совпадает с видимым, отсечение только мешало бы.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1e6;
    this.mesh.matrixAutoUpdate = false;
  }

  setColors(colors: SkyColors, sunDirection: THREE.Vector3): void {
    const u = this.material.uniforms;
    u.uZenith.value.set(colors.zenith);
    u.uHorizon.value.set(colors.horizon);
    u.uGround.value.set(colors.ground);
    u.uSunColor.value.set(colors.sun);
    u.uCloudLight.value.set(colors.cloudLight);
    u.uCloudShade.value.set(colors.cloudShade);
    u.uCloudCover.value = colors.cloudCover;
    u.uSunDir.value.copy(sunDirection).normalize();
  }

  /** Облака медленно плывут — небо живое даже на неподвижном кадре. */
  update(dt: number): void {
    this.material.uniforms.uDrift.value = (this.material.uniforms.uDrift.value + dt * 0.004) % 1;
  }
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // Только поворот камеры, без её сдвига: небо бесконечно далеко и «идёт» вместе с игроком.
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  // z = w — точка на дальней плоскости: всё, что ближе, закрывает небо.
  gl_Position = clip.xyww;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uCloudLight;
uniform vec3 uCloudShade;
uniform float uCloudCover;
uniform vec3 uSunDir;
uniform sampler2D uClouds;
uniform float uDrift;
varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  // Горизонт широкий и светлый, зенит — насыщенный: pow растягивает светлую полосу у горизонта.
  vec3 color = h > 0.0
    ? mix(uHorizon, uZenith, pow(h, 0.55))
    : mix(uHorizon, uGround, smoothstep(0.0, 0.12, -h));

  float toSun = max(dot(dir, uSunDir), 0.0);
  // Ореол вокруг солнца и сам диск.
  color += uSunColor * (pow(toSun, 12.0) * 0.35 + pow(toSun, 90.0) * 0.5);
  color = mix(color, uSunColor * 1.15 + 0.2, smoothstep(0.9993, 0.9996, toSun));

  if (h > 0.0) {
    // Облака — плоский слой над головой: делим на высоту, вдали они сжимаются к горизонту, как настоящие.
    vec2 uv = dir.xz / (h + 0.12) * 0.22 + vec2(uDrift, uDrift * 0.4);
    float density = texture2D(uClouds, uv).r;
    // Чуть ближе к солнцу облако тоньше — его край освещён, обратная сторона в тени.
    float towardSun = texture2D(uClouds, uv + uSunDir.xz * 0.03).r;
    float cover = smoothstep(1.0 - uCloudCover, 1.12 - uCloudCover * 0.75, density);
    cover *= smoothstep(0.0, 0.18, h);
    vec3 cloud = mix(uCloudShade, uCloudLight, clamp(0.55 + (density - towardSun) * 4.0, 0.0, 1.0));
    cloud += uSunColor * pow(toSun, 6.0) * 0.25;
    color = mix(color, cloud, cover * 0.95);
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Плотность облаков: сумма слоёв гладкого шума разной крупности (fbm). Каждый слой зациклен на размер
 * текстуры — повтор без шва. Только канал R: четверть памяти RGBA.
 */
function cloudTexture(): THREE.DataTexture {
  const size = 256;
  const random = seededRandom(7);
  const octaves = [4, 8, 16, 32].map((grid) => ({ grid, values: Array.from({ length: grid * grid }, () => random()) }));
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let weight = 0;
      let amplitude = 1;
      for (const { grid, values } of octaves) {
        sum += periodicNoise(values, grid, (x / size) * grid, (y / size) * grid) * amplitude;
        weight += amplitude;
        amplitude *= 0.5;
      }
      data[y * size + x] = Math.round((sum / weight) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Значения в узлах решётки grid×grid, между ними — плавно; решётка замкнута, как тор. */
function periodicNoise(values: number[], grid: number, fx: number, fy: number): number {
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const at = (x: number, y: number) => values[(((y % grid) + grid) % grid) * grid + (((x % grid) + grid) % grid)];
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
  const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
  return top + (bottom - top) * sy;
}
