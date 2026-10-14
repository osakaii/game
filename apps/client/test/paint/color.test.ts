import { describe, expect, it } from 'vitest';
import {
  colorDistance,
  hsvToRgb,
  matchLevel,
  parseHex,
  rgbToHsv,
  squareToSv,
  toHex,
} from '../../src/paint/color';

describe('hex', () => {
  it('parses and formats #rrggbb', () => {
    expect(parseHex('#E63946')).toEqual({ r: 230, g: 57, b: 70 });
    expect(parseHex('2a9d8f')).toEqual({ r: 42, g: 157, b: 143 });
    expect(toHex({ r: 230, g: 57, b: 70 })).toBe('#e63946');
  });

  it('rejects garbage', () => {
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('red')).toBeNull();
  });
});

describe('HSV', () => {
  it('converts primaries', () => {
    expect(toHex(hsvToRgb({ h: 0, s: 1, v: 1 }))).toBe('#ff0000');
    expect(toHex(hsvToRgb({ h: 120, s: 1, v: 1 }))).toBe('#00ff00');
    expect(toHex(hsvToRgb({ h: 240, s: 1, v: 0.5 }))).toBe('#000080');
    expect(toHex(hsvToRgb({ h: 77, s: 0, v: 1 }))).toBe('#ffffff');
  });

  it('round-trips through HSV without drift', () => {
    for (const hex of ['#e63946', '#2a9d8f', '#ffd400', '#1b1f2a', '#808080', '#f2f2f2']) {
      expect(toHex(hsvToRgb(rgbToHsv(parseHex(hex)!)))).toBe(hex);
    }
  });

  it('maps the square: top-right is the pure hue, bottom is black', () => {
    expect(squareToSv(1, 0)).toEqual({ s: 1, v: 1 });
    expect(squareToSv(0.3, 1)).toEqual({ s: 0.3, v: 0 });
    expect(squareToSv(-5, 9)).toEqual({ s: 0, v: 0 });
  });
});

describe('perceptual match (OKLab)', () => {
  it('same color is a perfect match', () => {
    const c = parseHex('#7cb342')!;
    expect(matchLevel(colorDistance(c, c))).toBe('perfect');
  });

  it('a slightly different green is close, red vs green is far', () => {
    expect(matchLevel(colorDistance(parseHex('#7cb342')!, parseHex('#78b040')!))).toBe('perfect');
    expect(matchLevel(colorDistance(parseHex('#7cb342')!, parseHex('#6fa83a')!))).toBe('close');
    expect(matchLevel(colorDistance(parseHex('#7cb342')!, parseHex('#e63946')!))).toBe('far');
  });

  it('is perceptual: equal RGB steps are not equal visual steps', () => {
    // +40 по синему каналу в тёмных тонах заметнее, чем +40 по зелёному в светлых.
    const darkBlue = colorDistance(parseHex('#000010')!, parseHex('#000038')!);
    const lightGreen = colorDistance(parseHex('#d0f0d0')!, parseHex('#d0ffd0')!);
    expect(darkBlue).toBeGreaterThan(lightGreen);
  });
});
