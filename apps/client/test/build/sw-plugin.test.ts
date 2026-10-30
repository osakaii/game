import { describe, expect, it } from 'vitest';
import { cacheName, precacheList, serviceWorkerSource } from '../../build/sw-plugin';

describe('service worker plugin', () => {
  it('precaches every build file, index.html as the page itself, never sw.js', () => {
    expect(precacheList(['index.html', 'assets/three-abc.js', 'sw.js', 'icon-192.png', '.vite/manifest.json'])).toEqual([
      '/',
      '/assets/three-abc.js',
      '/icon-192.png',
    ]);
  });

  it('names the cache by content: one changed byte gives a new cache, file order does not matter', () => {
    const a = cacheName(new Map([['index.html', 'v1'], ['assets/a.js', 'x']]));
    expect(a).toMatch(/^mecha-[0-9a-f]{12}$/);
    expect(cacheName(new Map([['assets/a.js', 'x'], ['index.html', 'v1']]))).toBe(a);
    expect(cacheName(new Map([['index.html', 'v2'], ['assets/a.js', 'x']]))).not.toBe(a);
  });

  it('puts the build data above the template', () => {
    const source = serviceWorkerSource('const PRECACHE = self.__MECHA_PRECACHE__;', ['/'], 'mecha-1');
    expect(source).toBe('self.__MECHA_PRECACHE__ = ["/"];\nself.__MECHA_CACHE__ = "mecha-1";\nconst PRECACHE = self.__MECHA_PRECACHE__;');
  });
});
