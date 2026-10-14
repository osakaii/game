/**
 * Шейдеры мокрой краски. Все работают одинаково: квадрат на всю текстуру (QUAD_VERTEX),
 * каждый тексель кожи — отдельный вызов fragment-шейдера.
 *
 * Мокрый слой (wet): rgb — цвет пигмента (линейный), a — количество краски (0..1).
 * Сухой слой (dry): обычный цвет кожи.
 * Показ (display): то, что натянуто на модель, — сухой слой с мокрым поверх.
 */

import { BODY_ZONES } from '@mecha/shared';

export const MAX_STAMPS = 16;
const PART_COUNT = BODY_ZONES.length;

export const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Смешивание красок. Пигменты не складывают свет, а ПОГЛОЩАЮТ его: жёлтая краска поглощает синий,
 * синяя — красный, вместе остаётся зелёный. Простая модель этого — среднее геометрическое
 * (линейное смешивание логарифмов отражения). Синий + жёлтый = зелёный, а не серый, как при
 * обычном усреднении RGB или в OKLab (OKLab хорош для сравнения цветов, но не для смешивания красок).
 *
 * Видимость мокрой краски — отдельно от её количества: даже тонкий слой кроет почти полностью,
 * иначе растёкшийся край выглядел бы полупрозрачным ореолом, как от аэрографа.
 */
const PAINT = /* glsl */ `
  vec3 paintLog(vec3 c) { return log(max(c, vec3(0.002))); }
  vec3 mixPaint(vec3 a, vec3 b, float t) { return exp(mix(paintLog(a), paintLog(b), t)); }
  float coverage(float amount) { return clamp(amount / 0.6, 0.0, 1.0); }
`;

/**
 * Кисть кладёт краску в МОКРЫЙ слой: количество растёт, цвет смешивается с уже лежащей мокрой краской
 * пропорционально количествам (капнули мало жёлтого в много синего — чуть позеленело).
 */
export const BRUSH_WET_FRAGMENT = /* glsl */ `
  #define MAX_STAMPS ${MAX_STAMPS}
  #define PART_COUNT ${PART_COUNT}
  uniform sampler2D uWet;
  uniform sampler2D uPositions; // rgb — точка на теле в позе покоя, a — номер части + 1
  uniform sampler2D uNormals;
  uniform int uCount;
  uniform vec3 uCenters[MAX_STAMPS];
  uniform vec3 uStampNormals[MAX_STAMPS];
  uniform int uMasks[MAX_STAMPS]; // каким частям достаётся оттиск: бит = индекс части (см. paintMask)
  uniform float uRadius;
  uniform float uHardness;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform int uMode;            // 0 кисть, 1 спрей, 2 губка, 3 ластик
  uniform float uSeed;          // для спрея: новые капли на каждый оттиск
  uniform sampler2D uNoise;
  uniform vec3 uBaseColors[PART_COUNT]; // основа кожи по частям тела — её кладёт ластик
  varying vec2 vUv;
  ${PAINT}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec4 wet = texture2D(uWet, vUv);
    vec4 body = texture2D(uPositions, vUv);
    float coverage = 0.0;
    int partIndex = int(body.a + 0.5) - 1;
    if (partIndex >= 0) {
      vec3 normal = texture2D(uNormals, vUv).rgb * 2.0 - 1.0;
      for (int i = 0; i < MAX_STAMPS; i++) {
        if (i >= uCount) break;
        if (((uMasks[i] >> partIndex) & 1) == 0) continue;
        float d = distance(body.rgb, uCenters[i]) / uRadius;
        float falloff = 1.0 - smoothstep(uHardness, 1.0, d);
        float facing = smoothstep(-0.6, -0.2, dot(normal, uStampNormals[i]));
        coverage = max(coverage, falloff * facing);
      }
    }
    vec3 paint = uColor;
    if (uMode == 1) {
      // Спрей: в круге — редкие случайные капли, каждый оттиск — новые. Слоями набирается плотность.
      coverage *= step(hash(vUv * 512.0 + uSeed), 0.12) * 0.9;
    } else if (uMode == 2) {
      // Губка: пористая фактура, привязанная к поверхности тела (а не к экрану), — узор не «плывёт».
      float pores = texture2D(uNoise, (body.xy + body.zz * 0.7) * 2.2).r;
      coverage *= smoothstep(0.42, 0.58, pores);
    } else if (uMode == 3) {
      // Ластик: кладём цвет основы этой части тела (белый или форма ищущего).
      for (int i = 0; i < PART_COUNT; i++) if (i == partIndex) paint = uBaseColors[i];
    }
    float added = coverage * uOpacity;
    if (added <= 0.0) { gl_FragColor = wet; return; }
    float amount = min(1.0, wet.a + added);
    // Доля нового цвета = сколько добавили / сколько стало.
    vec3 color = wet.a > 0.001 ? mixPaint(wet.rgb, paint, added / max(wet.a + added, 0.001)) : paint;
    gl_FragColor = vec4(color, amount);
  }
`;

/**
 * Шаг течения: обмен краской с четырьмя соседями + подтёки вниз на вертикальных гранях.
 * Высыхание здесь не считаем — оно отдельным проходом.
 *
 * Обмен честный по массе: поток между соседями i и j считается одинаково с обеих сторон
 * (шум берём средний для пары), поэтому краска не появляется и не исчезает.
 */
export const FLOW_FRAGMENT = /* glsl */ `
  uniform sampler2D uWet;
  uniform sampler2D uPositions;
  uniform sampler2D uNormals;
  uniform sampler2D uNoise;
  uniform vec2 uTexel;
  uniform float uDiffusion;     // доля разницы, перетекающая к соседу за проход
  uniform float uDrip;          // доля излишка, стекающая вниз за проход
  uniform float uDripThreshold; // тоньше этого — не стекает
  uniform float uDither;        // 1/255 для 8-битного слоя, 0 для half-float
  varying vec2 vUv;
  ${PAINT}

  // Подвижность: течёт только толстая краска. Это нелинейная диффузия (модель «пористой среды»):
  // у неё резкий фронт — лужица расширяется, а не расплывается ореолом. Растёкшись до толщины
  // ~0.5, краска останавливается: клякса подрастает примерно в полтора раза.
  float mobility(float amount) { return smoothstep(0.45, 0.9, amount); }

  // Шум, вытянутый по вертикали: узкие «каналы», по которым стекают подтёки (не всей шириной кляксы).
  float dripChannel(vec2 uv) { return smoothstep(0.5, 0.8, texture2D(uNoise, vec2(uv.x * 6.0, uv.y * 0.3)).r); }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float part = texture2D(uPositions, vUv).a;
    vec4 c = texture2D(uWet, vUv);
    if (part < 0.5) { gl_FragColor = vec4(0.0); return; }
    float noiseHere = texture2D(uNoise, vUv).r;

    float inflow = 0.0;
    vec3 inflowLog = vec3(0.0); // цвет притока копим в логарифмах — смешивание пигментов
    float outflow = 0.0;

    vec2 offsets[4];
    offsets[0] = vec2(uTexel.x, 0.0);
    offsets[1] = vec2(-uTexel.x, 0.0);
    offsets[2] = vec2(0.0, uTexel.y);
    offsets[3] = vec2(0.0, -uTexel.y);
    for (int i = 0; i < 4; i++) {
      vec2 uv = vUv + offsets[i];
      // Сосед с другой части тела или пустое место атласа — краска туда не течёт.
      if (abs(texture2D(uPositions, uv).a - part) > 0.5) continue;
      vec4 n = texture2D(uWet, uv);
      // Плавный шум делает скорость неравномерной — край лужицы получается неровным, «живым».
      float k = uDiffusion * (0.35 + 1.3 * 0.5 * (noiseHere + texture2D(uNoise, uv).r));
      float diff = n.a - c.a;
      if (diff > 0.0) {
        float f = diff * k * mobility(n.a);
        inflow += f;
        inflowLog += paintLog(n.rgb) * f;
      } else {
        outflow += -diff * k * mobility(c.a);
      }
    }

    // Подтёки: только на вертикальных гранях и только в «каналах». Благодаря раскладке атласа
    // «вверх по текстуре» = «вверх в мире». Стекает лишь излишек над порогом — за подтёком
    // остаётся след, и подтёк сам заканчивается, когда излишек кончился.
    vec3 normal = texture2D(uNormals, vUv).rgb * 2.0 - 1.0;
    if (abs(normal.y) < 0.5) {
      vec2 above = vUv + vec2(0.0, uTexel.y);
      vec2 below = vUv - vec2(0.0, uTexel.y);
      if (abs(texture2D(uPositions, above).a - part) < 0.5) {
        vec4 a = texture2D(uWet, above);
        float drip = max(0.0, a.a - uDripThreshold) * uDrip * dripChannel(above);
        inflow += drip;
        inflowLog += paintLog(a.rgb) * drip;
      }
      if (abs(texture2D(uPositions, below).a - part) < 0.5) {
        outflow += max(0.0, c.a - uDripThreshold) * uDrip * dripChannel(vUv);
      }
    }

    float kept = max(0.0, c.a - outflow);
    float amount = kept + inflow;
    vec3 color = amount > 0.0001 ? exp((paintLog(c.rgb) * kept + inflowLog) / amount) : c.rgb;
    // 8-битный слой: подмешиваем шум, иначе маленькие потоки округлялись бы в ноль и краска «застревала».
    amount += (hash(vUv * 512.0) - 0.5) * uDither;
    gl_FragColor = vec4(color, clamp(amount, 0.0, 1.0));
  }
`;

/**
 * Высыхание, часть 1: высохшая доля краски переходит в сухой слой.
 *
 * Видимый цвет = сухой*(1-a) + мокрый*a. Если мокрого стало a' вместо a, сухой должен измениться так,
 * чтобы видимый цвет НЕ прыгнул. Решение — обычное смешивание с прозрачностью (a - a') / (1 - a'):
 * поэтому этот проход рисует прямо в сухой слой с аппаратным NormalBlending.
 */
export const DRY_TRANSFER_FRAGMENT = /* glsl */ `
  uniform sampler2D uWet;
  uniform float uDryAmount; // сколько количества высыхает за шаг
  varying vec2 vUv;
  ${PAINT}
  void main() {
    vec4 wet = texture2D(uWet, vUv);
    float after = wet.a < 0.004 ? 0.0 : max(0.0, wet.a - uDryAmount);
    // Видимость до и после: что «перестало быть мокрым», переходит в сухой слой.
    float before = coverage(wet.a);
    float now = coverage(after);
    float alpha = now >= 0.999 ? 0.0 : clamp((before - now) / (1.0 - now), 0.0, 1.0);
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(wet.rgb, alpha);
  }
`;

/** Высыхание, часть 2: в мокром слое краски становится меньше на ту же долю. */
export const DRY_WET_FRAGMENT = /* glsl */ `
  uniform sampler2D uWet;
  uniform float uDryAmount;
  varying vec2 vUv;
  void main() {
    vec4 wet = texture2D(uWet, vUv);
    float after = wet.a < 0.004 ? 0.0 : max(0.0, wet.a - uDryAmount);
    gl_FragColor = vec4(wet.rgb, after);
  }
`;

/**
 * Показ: сухой слой и мокрый поверх. Мокрая краска чуть темнее и насыщеннее — как в жизни,
 * поэтому видно, что она ещё не высохла. Высохнув, становится своего настоящего цвета.
 */
export const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D uDry;
  uniform sampler2D uWet;
  varying vec2 vUv;
  ${PAINT}
  void main() {
    vec3 dry = texture2D(uDry, vUv).rgb;
    vec4 wet = texture2D(uWet, vUv);
    vec3 wetLook = wet.rgb * (1.0 - 0.14 * clamp(wet.a, 0.0, 1.0));
    gl_FragColor = vec4(mix(dry, wetLook, coverage(wet.a)), 1.0);
  }
`;

/** Мгновенно досушить: мокрый слой целиком ложится на сухой (смешивание по количеству). */
export const BAKE_FRAGMENT = /* glsl */ `
  uniform sampler2D uWet;
  varying vec2 vUv;
  ${PAINT}
  void main() {
    vec4 wet = texture2D(uWet, vUv);
    if (wet.a <= 0.0) discard;
    gl_FragColor = vec4(wet.rgb, coverage(wet.a));
  }
`;

export const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D uSource;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uSource, vUv).rgb, 1.0);
  }
`;

export const CLEAR_FRAGMENT = /* glsl */ `
  void main() { gl_FragColor = vec4(0.0); }
`;
