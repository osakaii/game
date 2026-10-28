import { storage } from '../ui/dom';

const MUTED_KEY = 'mecha:muted';

interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  /** Задержка старта, с — для мелодий из нескольких нот. */
  delay?: number;
  /** Стерео: -1 — слева, 1 — справа (откуда слышен свист подсказки). */
  pan?: number;
  /** Плавно сменить частоту к концу ноты (глиссандо). */
  slideTo?: number;
}

/**
 * Синтезатор звуковых эффектов на Web Audio API — без единого аудиофайла.
 *
 * Граф: источник (осциллятор или шум) -> GainNode (огибающая громкости) -> master -> динамики.
 * Огибающая — быстрый подъём и плавный спад, иначе на краях звука слышны щелчки.
 *
 * Браузеры не дают играть звук, пока пользователь не коснулся страницы (autoplay policy).
 * Поэтому AudioContext создаём/возобновляем по касанию. Подводные камни телефонов:
 * - касание пальцем на `pointerdown` по стандарту НЕ даёт права на звук (только мышь) — Safari строг,
 *   Chrome мягче; отсюда «у одних звук есть, у других нет». Слушаем и отпускание пальца (touchend/pointerup);
 * - после звонка или сворачивания Safari ставит контекст в 'interrupted' — возобновляем из любого
 *   состояния, кроме 'running', и при возврате во вкладку;
 * - iPhone по умолчанию глушит Web Audio переключателем «без звука» (YouTube при этом играет).
 *   Audio Session API (Safari 16.4+): 'playback' — играем как видео, 'ambient' — как раньше.
 */
/** Касание пальцем даёт право на звук на отпускании (touchend/pointerup), мышь — на нажатии. */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

type AudioSessionType = 'ambient' | 'playback';

/** Audio Session API есть только в Safari 16.4+, в типах TS его нет. */
function setAudioSession(type: AudioSessionType) {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = type;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = storage.get(MUTED_KEY) === '1';

  constructor() {
    const unlock = () => this.unlock();
    for (const event of UNLOCK_EVENTS) window.addEventListener(event, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.resume();
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    storage.set(MUTED_KEY, muted ? '1' : '0');
    if (this.master) this.master.gain.value = muted ? 0 : 1;
    // Без звука — отдаём телефону его обычное поведение: музыка игрока снова играет.
    setAudioSession(muted ? 'ambient' : 'playback');
  }

  /** Проверка места ищущим: глухой «шлёп». volume 0..1 — тише, если далеко. */
  splat(volume = 1): void {
    this.noise(0.18, 0.5 * volume, 900);
    this.tone(160, 0.15, { volume: 0.4 * volume, slideTo: 60 });
  }

  /**
   * Выстрел краскомёта: пневматический «пфт» (короткий шипящий выдох) + низкий «чпок» со спадом.
   * volume 0..1 — чужой выстрел вдалеке тише.
   */
  shoot(volume = 1): void {
    this.noise(0.07, 0.35 * volume, 4200);
    this.tone(420, 0.09, { type: 'triangle', volume: 0.3 * volume, slideTo: 110 });
  }

  /**
   * Свист подсказки «фьюить»: две восходящие ноты. Чистый синус — его ухо легко отличает
   * от шлепков и шагов и определяет направление. volume — по расстоянию, pan — по стороне.
   */
  whistle(volume = 1, pan = 0): void {
    this.tone(1300, 0.16, { volume: 0.22 * volume, slideTo: 2100, pan });
    this.tone(1700, 0.22, { volume: 0.22 * volume, slideTo: 2500, delay: 0.2, pan });
  }

  /** Подтверждение попадания у стреляющего: звонкий «дзынь» поверх арпеджио «найден». */
  hitConfirm(): void {
    this.tone(1568, 0.12, { type: 'square', volume: 0.08 });
    this.tone(2093, 0.18, { type: 'triangle', volume: 0.12, delay: 0.05 });
  }

  /** Кого-то нашли: короткое восходящее арпеджио. */
  found(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', delay: i * 0.07, volume: 0.25 }));
  }

  /** Тиканье последних секунд фазы. */
  tick(): void {
    this.tone(1200, 0.05, { type: 'square', volume: 0.08 });
  }

  /** Смена фазы. */
  phase(): void {
    this.tone(440, 0.15, { type: 'triangle', volume: 0.25 });
    this.tone(660, 0.25, { type: 'triangle', volume: 0.25, delay: 0.15 });
  }

  win(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', delay: i * 0.1, volume: 0.25 }));
  }

  lose(): void {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, { type: 'sawtooth', delay: i * 0.18, volume: 0.12 }));
  }

  /**
   * Шорох кисти: зацикленный шум через полосовой фильтр. Чем быстрее мазок — тем громче и «выше»,
   * как у настоящей кисти по бумаге. Пока палец стоит — тишина.
   */
  brush(state: 'start' | 'move' | 'end', speed = 0): void {
    const ctx = this.ready();
    if (state === 'start') {
      if (!ctx || this.brushSource) return;
      const source = ctx.createBufferSource();
      source.buffer = this.ensureNoise(ctx);
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.master!);
      source.start();
      this.brushSource = source;
      this.brushFilter = filter;
      this.brushGain = gain;
      return;
    }
    if (!ctx || !this.brushGain || !this.brushFilter || !this.brushSource) return;
    const now = ctx.currentTime;
    if (state === 'move') {
      // setTargetAtTime — плавно подтянуть громкость, без щелчков на каждом событии пальца.
      this.brushGain.gain.setTargetAtTime(Math.min(0.22, speed * 0.5), now, 0.03);
      this.brushFilter.frequency.setTargetAtTime(900 + Math.min(speed, 1.5) * 2500, now, 0.05);
      return;
    }
    this.brushGain.gain.setTargetAtTime(0, now, 0.05);
    this.brushSource.stop(now + 0.3);
    this.brushSource = null;
    this.brushGain = null;
    this.brushFilter = null;
  }

  private brushSource: AudioBufferSourceNode | null = null;
  private brushGain: GainNode | null = null;
  private brushFilter: BiquadFilterNode | null = null;

  private ensureNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  private unlock() {
    if (!this.ctx) {
      // До создания контекста: тип сессии читается при старте звука.
      setAudioSession(this.muted ? 'ambient' : 'playback');
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    this.resume();
  }

  /** 'suspended' (ещё не разрешили) и 'interrupted' (Safari после звонка) — оба возобновляем. */
  private resume() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    ctx.resume().catch(() => {
      /* касание не дало права на звук — попробуем на следующем */
    });
  }

  private tone(frequency: number, duration: number, options: ToneOptions = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(frequency, start);
    if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, start + duration);
    osc.connect(this.envelope(start, duration, options.volume ?? 0.3, options.pan));
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number, lowpassHz: number) {
    const ctx = this.ready();
    if (!ctx) return;
    // Буфер белого шума создаём один раз и переиспользуем.
    const source = ctx.createBufferSource();
    source.buffer = this.ensureNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; // срезаем высокие частоты: из «шипения» получается «шлепок»
    filter.frequency.value = lowpassHz;
    const start = ctx.currentTime;
    source.connect(filter).connect(this.envelope(start, duration, volume));
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  /** Огибающая: 5 мс подъём, затем экспоненциальный спад до тишины. */
  private envelope(start: number, duration: number, volume: number, pan = 0): GainNode {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner).connect(this.master!);
    } else {
      gain.connect(this.master!);
    }
    return gain;
  }

  private ready(): AudioContext | null {
    return this.ctx && !this.muted && this.ctx.state === 'running' ? this.ctx : null;
  }
}
