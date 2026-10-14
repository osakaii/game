import { describe, expect, it } from 'vitest';
import { detectSkinImage, skinBaseColor } from '../src/skin.js';

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function webp(kind: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  const text = (s: string, at: number) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
  text('RIFF', 0);
  text('WEBP', 8);
  text(kind, 12);
  const view = new DataView(b.buffer);
  if (kind === 'VP8 ') {
    b.set([0x9d, 0x01, 0x2a], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  } else if (kind === 'VP8L') {
    b[20] = 0x2f;
    view.setUint32(21, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
  } else {
    b[24] = (width - 1) & 0xff;
    b[25] = ((width - 1) >> 8) & 0xff;
    b[27] = (height - 1) & 0xff;
    b[28] = ((height - 1) >> 8) & 0xff;
  }
  return b;
}

describe('detectSkinImage', () => {
  it('reads PNG size from the IHDR chunk', () => {
    expect(detectSkinImage(png(512, 512))).toEqual({ format: 'png', width: 512, height: 512 });
  });

  it.each(['VP8 ', 'VP8L', 'VP8X'] as const)('reads WebP %s size', (kind) => {
    expect(detectSkinImage(webp(kind, 512, 512))).toEqual({ format: 'webp', width: 512, height: 512 });
    expect(detectSkinImage(webp(kind, 300, 200))?.width).toBe(300);
  });

  it('rejects anything else', () => {
    expect(detectSkinImage(new TextEncoder().encode('<script>alert(1)</script> padding padding'))).toBeNull();
    expect(detectSkinImage(new Uint8Array(4))).toBeNull();
    const gif = new TextEncoder().encode('GIF89a' + ' '.repeat(40));
    expect(detectSkinImage(gif)).toBeNull();
  });
});

describe('skin base', () => {
  it('seekers wear a uniform, hiders start white', () => {
    expect(skinBaseColor('seeker', 'torso')).toBe('#d62828');
    expect(skinBaseColor('seeker', 'shinLeft')).toBe('#2b2d42');
    expect(skinBaseColor('seeker', 'handRight')).toBe('#2b2d42');
    expect(skinBaseColor('default', 'head')).toBe('#f2f2f2');
  });
});
