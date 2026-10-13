import { storage } from '../ui/dom';

const MUTED_KEY = 'mecha:muted';

interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  /** Задержка старта, с — для мелодий из нескольких нот. */
  delay?: number;
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
 * Поэтому AudioContext создаём/возобновляем по первому касанию.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = storage.get(MUTED_KEY) === '1';

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    storage.set(MUTED_KEY, muted ? '1' : '0');
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  /** Проверка места ищущим: глухой «шлёп». volume 0..1 — тише, если далеко. */
  splat(volume = 1): void {
    this.noise(0.18, 0.5 * volume, 900);
    this.tone(160, 0.15, { volume: 0.4 * volume, slideTo: 60 });
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

  private unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(frequency: number, duration: number, options: ToneOptions = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(frequency, start);
    if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, start + duration);
    osc.connect(this.envelope(start, duration, options.volume ?? 0.3));
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number, lowpassHz: number) {
    const ctx = this.ready();
    if (!ctx) return;
    // Буфер белого шума создаём один раз и переиспользуем.
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; // срезаем высокие частоты: из «шипения» получается «шлепок»
    filter.frequency.value = lowpassHz;
    const start = ctx.currentTime;
    source.connect(filter).connect(this.envelope(start, duration, volume));
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  /** Огибающая: 5 мс подъём, затем экспоненциальный спад до тишины. */
  private envelope(start: number, duration: number, volume: number): GainNode {
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(this.master!);
    return gain;
  }

  private ready(): AudioContext | null {
    return this.ctx && !this.muted && this.ctx.state === 'running' ? this.ctx : null;
  }
}
