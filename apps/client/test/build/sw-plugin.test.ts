import { describe, expect, it } from 'vitest';
import { cacheName, lazyChunks, precacheList, serviceWorkerSource, type ChunkInfo } from '../../build/sw-plugin';

describe('service worker plugin', () => {
  it('precaches every build file, index.html as the page itself, never sw.js', () => {
    expect(precacheList(['index.html', 'assets/three-abc.js', 'sw.js', 'icon-192.png', '.vite/manifest.json'])).toEqual([
      '/',
      '/assets/three-abc.js',
      '/icon-192.png',
    ]);
  });

  it('does not precache what is loaded on demand: room maps come when someone enters them', () => {
    const chunk = (fileName: string, name: string, imports: string[] = [], isEntry = false): ChunkInfo => ({ type: 'chunk', fileName, name, imports, isEntry });
    const lazy = lazyChunks(
      [
        chunk('assets/index.js', 'index', ['assets/three.js', 'assets/map.js'], true),
        chunk('assets/three.js', 'three'),
        chunk('assets/map.js', 'map'),
        // Карта главного экрана и её детали нужны сразу — даже если сервер спит.
        chunk('assets/ala-too.js', 'ala-too', ['assets/procedural.js', 'assets/map.js']),
        chunk('assets/procedural.js', 'procedural'),
        chunk('assets/castle.js', 'castle', ['assets/recipe.js', 'assets/procedural.js']),
        chunk('assets/recipe.js', 'recipe'),
      ],
      ['ala-too'],
    );
    expect([...lazy].sort()).toEqual(['assets/castle.js', 'assets/recipe.js']);
    expect(precacheList(['index.html', 'assets/castle.js', 'assets/ala-too.js'], lazy)).toEqual(['/', '/assets/ala-too.js']);
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
