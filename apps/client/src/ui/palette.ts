import type { PaintStudio } from '../paint/paint-studio';
import {
  clamp01,
  colorDistance,
  hsvToRgb,
  matchLevel,
  parseHex,
  rgbToHsv,
  squareToSv,
  toHex,
  type Hsv,
  type MatchLevel,
} from '../paint/color';
import { $, storage } from './dom';

const SAVED_KEY = 'mecha:saved-colors';
const SAVED_LIMIT = 8;
const LONG_PRESS_MS = 500;

const MATCH_TEXT: Record<MatchLevel, string> = {
  perfect: 'Идеально',
  close: 'Почти',
  noticeable: 'Заметно',
  far: 'Сильно отличается',
};

/**
 * Палитра Мастерской: квадрат насыщенности/яркости, полоса оттенков, плотность, #hex,
 * сохранённые цвета и сравнение цвета кисти с цветом фона.
 *
 * Своё состояние держит в HSV: если хранить только hex, у серого и чёрного «терялся» бы оттенок
 * (у них s = 0 или v = 0, и при пересчёте из RGB оттенок неизвестен) — ползунок прыгал бы в красный.
 */
export class Palette {
  private readonly root = $('#palette');
  private readonly sv = $<HTMLCanvasElement>('#palette-sv');
  private readonly hue = $<HTMLCanvasElement>('#palette-hue');
  private readonly opacity = $<HTMLInputElement>('#palette-opacity');
  private readonly hex = $<HTMLInputElement>('#palette-hex');
  private readonly saved = $('#palette-saved');
  private readonly cmpBrush = $('#cmp-brush');
  private readonly cmpBackground = $('#cmp-bg');
  private readonly cmpLabel = $('#cmp-label');
  private hsv: Hsv = { h: 0, s: 1, v: 1 };
  private lastHex = '';
  private savedColors: string[] = loadSaved();

  constructor(private readonly studio: PaintStudio) {
    this.bindDrag(this.sv, (x, y) => {
      const { s, v } = squareToSv(x, y);
      this.setHsv({ ...this.hsv, s, v });
    });
    this.bindDrag(this.hue, (x) => this.setHsv({ ...this.hsv, h: clamp01(x) * 359.9 }));
    this.opacity.addEventListener('input', () => studio.setOpacity(Number(this.opacity.value)));
    this.hex.addEventListener('change', () => {
      const rgb = parseHex(this.hex.value);
      if (rgb) studio.setColor(toHex(rgb));
      else this.hex.value = studio.colorHex; // неверный ввод — вернуть текущий цвет
    });
    $('#palette-save').addEventListener('click', () => this.save(studio.colorHex));
    this.bindSavedSwatches();
    studio.on('change', () => this.render());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  render(): void {
    const s = this.studio;
    if (!s.active) this.close();
    if (this.root.hidden) return;

    // Цвет поменяли снаружи (пипетка, недавние, #hex) — подстроить HSV, сохранив оттенок у серых.
    if (s.colorHex !== this.lastHex) {
      const next = rgbToHsv(parseHex(s.colorHex)!);
      this.hsv = next.s === 0 || next.v === 0 ? { ...next, h: this.hsv.h } : next;
      this.lastHex = s.colorHex;
    }
    if (document.activeElement !== this.hex) this.hex.value = s.colorHex;
    this.opacity.value = String(s.opacity);
    this.drawSquare();
    this.drawHueBar();
    this.renderCompare();
    this.renderSaved();
  }

  private setHsv(hsv: Hsv) {
    this.hsv = hsv;
    const hex = toHex(hsvToRgb(hsv));
    this.lastHex = hex; // это наш собственный цвет — не пересчитывать HSV обратно
    this.studio.setColor(hex);
  }

  // ---------- Рисование ----------

  /**
   * Квадрат: по горизонтали насыщенность (белый -> чистый оттенок), по вертикали яркость (сверху вниз — к чёрному).
   * Две градиентные заливки поверх друг друга — дёшево, без попиксельного цикла.
   */
  private drawSquare() {
    const ctx = this.prepare(this.sv);
    if (!ctx) return;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = toHex(hsvToRgb({ h: this.hsv.h, s: 1, v: 1 }));
    ctx.fillRect(0, 0, w, h);
    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, '#ffffff');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, w, h);
    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, '#000000');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, h);
    this.marker(ctx, this.hsv.s * w, (1 - this.hsv.v) * h);
  }

  private drawHueBar() {
    const ctx = this.prepare(this.hue);
    if (!ctx) return;
    const { width: w, height: h } = ctx.canvas;
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) gradient.addColorStop(i / 6, `hsl(${i * 60} 100% 50%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    this.marker(ctx, (this.hsv.h / 360) * w, h / 2);
  }

  /** Подогнать размер canvas под экран (резкость на экранах с плотностью пикселей 2–3). */
  private prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
    return canvas.getContext('2d');
  }

  private marker(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const r = Math.max(5, ctx.canvas.height * 0.06);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  private renderCompare() {
    const { colorHex, reference } = this.studio;
    this.cmpBrush.style.background = colorHex;
    this.cmpBackground.style.background = reference ?? 'transparent';
    this.cmpBackground.classList.toggle('empty', !reference);
    if (!reference) {
      this.cmpLabel.textContent = 'Пипеткой по предмету — запомню фон';
      this.cmpLabel.dataset.level = '';
      return;
    }
    const level = matchLevel(colorDistance(parseHex(colorHex)!, parseHex(reference)!));
    this.cmpLabel.textContent = MATCH_TEXT[level];
    this.cmpLabel.dataset.level = level;
  }

  // ---------- Сохранённые цвета ----------

  private save(hex: string) {
    this.savedColors = [hex, ...this.savedColors.filter((c) => c !== hex)].slice(0, SAVED_LIMIT);
    storage.set(SAVED_KEY, JSON.stringify(this.savedColors));
    this.renderSaved();
  }

  private remove(hex: string) {
    this.savedColors = this.savedColors.filter((c) => c !== hex);
    storage.set(SAVED_KEY, JSON.stringify(this.savedColors));
    this.renderSaved();
    navigator.vibrate?.(15);
  }

  private renderSaved() {
    const swatches = this.savedColors.map((hex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = hex;
      b.style.background = hex;
      b.setAttribute('aria-label', `Сохранённый цвет ${hex}, удерживай чтобы удалить`);
      return b;
    });
    this.saved.replaceChildren(...swatches);
  }

  /** Тап — выбрать цвет, долгое нажатие — удалить. Один обработчик на контейнер (делегирование). */
  private bindSavedSwatches() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let longPressed = false;
    this.saved.addEventListener('pointerdown', (e) => {
      const hex = (e.target as HTMLElement).dataset.color;
      if (!hex) return;
      longPressed = false;
      timer = setTimeout(() => {
        longPressed = true;
        this.remove(hex);
      }, LONG_PRESS_MS);
    });
    const cancel = () => clearTimeout(timer);
    this.saved.addEventListener('pointerup', cancel);
    this.saved.addEventListener('pointerleave', cancel);
    this.saved.addEventListener('click', (e) => {
      const hex = (e.target as HTMLElement).dataset.color;
      if (hex && !longPressed) this.studio.setColor(hex);
    });
  }

  // ---------- Перетаскивание по квадрату и полосе ----------

  /** onPick получает координаты внутри элемента в долях 0..1. */
  private bindDrag(el: HTMLElement, onPick: (x: number, y: number) => void) {
    const pick = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      onPick((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* быстрый тап */
      }
      pick(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (el.hasPointerCapture?.(e.pointerId)) pick(e);
    });
  }
}

function loadSaved(): string[] {
  try {
    const value = JSON.parse(storage.get(SAVED_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string' && !!parseHex(c)) : [];
  } catch {
    return [];
  }
}
