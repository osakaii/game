import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serviceWorkerSource } from '../../build/sw-plugin';

const ORIGIN = 'https://mecha.test';
const TEMPLATE = readFileSync(new URL('../../src/pwa/sw.js', import.meta.url), 'utf8');
const PRECACHE = ['/', '/assets/three-abc.js', '/icon-192.png'];

type FakeRequest = { url: string; method: string; mode: string };
type Handler = (event: unknown) => void;

/** Кэш браузера в памяти: ключ — полный адрес (как у настоящего Cache API без учёта Vary). */
function fakeCaches() {
  const store = new Map<string, Map<string, Response>>();
  const key = (r: string | FakeRequest) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const cache = store.get(name)!;
    return {
      match: async (r: string | FakeRequest) => cache.get(key(r))?.clone(),
      put: async (r: string | FakeRequest, response: Response) => void cache.set(key(r), response),
      addAll: async (urls: string[]) => {
        for (const url of urls) cache.set(key(url), await sw.fetch(request(url)));
      },
    };
  };
  const sw = { fetch: vi.fn<(r: FakeRequest) => Promise<Response>>() };
  return {
    store,
    fetch: sw.fetch,
    api: {
      open,
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
    },
  };
}

function request(path: string, init: Partial<FakeRequest> = {}): FakeRequest {
  return { url: new URL(path, ORIGIN).href, method: 'GET', mode: 'cors', ...init };
}

/** Запускает sw.js как в браузере: свой глобальный self, свои caches и fetch. */
function boot(cache = 'mecha-new') {
  const caches = fakeCaches();
  const handlers = new Map<string, Handler>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  runInNewContext(serviceWorkerSource(TEMPLATE, PRECACHE, cache), {
    self,
    caches: caches.api,
    fetch: caches.fetch,
    URL,
    setTimeout,
  });
  /** Событие с waitUntil/respondWith; ждём всё, что SW попросил подождать. */
  const dispatch = async (type: string, extra: object = {}) => {
    const waits: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get(type)!({
      ...extra,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<Response>) => (response = p),
    });
    return { response, settled: () => Promise.all(waits) };
  };
  return { self, caches, dispatch };
}

async function bodyOf(response: Promise<Response> | undefined): Promise<string> {
  return (await response!).text();
}

async function installed(cache = 'mecha-new') {
  const sw = boot(cache);
  sw.caches.fetch.mockImplementation(async (r) => new Response(`cached ${new URL(r.url).pathname}`));
  await (await sw.dispatch('install')).settled();
  sw.caches.fetch.mockReset();
  return sw;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('service worker: install and activate', () => {
  it('puts the whole build into the cache and takes over without waiting for old tabs', async () => {
    const sw = await installed();
    expect([...sw.caches.store.get('mecha-new')!.keys()]).toEqual(PRECACHE.map((p) => new URL(p, ORIGIN).href));
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it('deletes caches of older builds, not foreign ones', async () => {
    const sw = await installed();
    await sw.caches.api.open('mecha-old');
    await sw.caches.api.open('other-app');
    await (await sw.dispatch('activate')).settled();
    expect([...sw.caches.store.keys()].sort()).toEqual(['mecha-new', 'other-app']);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});

describe('service worker: the page', () => {
  const navigate = (path = '/?room=ABCD') => ({ request: request(path, { mode: 'navigate' }) });

  it('is fresh from the network when the server answers, and the cache gets the new page', async () => {
    const sw = await installed();
    sw.caches.fetch.mockResolvedValue(new Response('new page'));
    const { response, settled } = await sw.dispatch('fetch', navigate());
    expect(await bodyOf(response)).toBe('new page');
    await settled();
    expect(await (await sw.caches.api.open('mecha-new')).match('/').then((r) => r!.text())).toBe('new page');
  });

  it('comes from the cache when the server is down or deploying (502)', async () => {
    const sw = await installed();
    sw.caches.fetch.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));
    expect(await bodyOf((await sw.dispatch('fetch', navigate())).response)).toBe('cached /');
    sw.caches.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await bodyOf((await sw.dispatch('fetch', navigate())).response)).toBe('cached /');
  });

  it('comes from the cache after 4 s while a sleeping server wakes up', async () => {
    vi.useFakeTimers();
    const sw = await installed();
    sw.caches.fetch.mockReturnValue(new Promise(() => {}));
    const { response } = await sw.dispatch('fetch', navigate());
    let body: string | undefined;
    void bodyOf(response).then((text) => (body = text));
    await vi.advanceTimersByTimeAsync(3900);
    expect(body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    expect(body).toBe('cached /');
  });

  it('goes to the network on the very first visit (nothing cached yet)', async () => {
    const sw = boot();
    sw.caches.fetch.mockResolvedValue(new Response('first'));
    expect(await bodyOf((await sw.dispatch('fetch', navigate('/'))).response)).toBe('first');
  });
});

describe('service worker: files', () => {
  it('serves hashed assets from the cache without asking the server', async () => {
    const sw = await installed();
    expect(await bodyOf((await sw.dispatch('fetch', { request: request('/assets/three-abc.js') })).response)).toBe('cached /assets/three-abc.js');
    expect(sw.caches.fetch).not.toHaveBeenCalled();
  });

  it('fetches and keeps an asset it has not seen', async () => {
    const sw = await installed();
    sw.caches.fetch.mockResolvedValue(new Response('chunk'));
    await bodyOf((await sw.dispatch('fetch', { request: request('/assets/late-xyz.js') })).response);
    expect(await (await sw.caches.api.open('mecha-new')).match('/assets/late-xyz.js')).toBeDefined();
  });

  it('serves icons from the cache and refreshes them in the background', async () => {
    const sw = await installed();
    sw.caches.fetch.mockResolvedValue(new Response('new icon'));
    const { response, settled } = await sw.dispatch('fetch', { request: request('/icon-192.png') });
    expect(await bodyOf(response)).toBe('cached /icon-192.png');
    await settled();
    expect(await (await sw.caches.api.open('mecha-new')).match('/icon-192.png').then((r) => r!.text())).toBe('new icon');
  });

  it.each([
    ['the socket', request('/socket.io/?EIO=4&transport=polling')],
    ['health', request('/health')],
    ['stats', request('/stats')],
    ['a POST', request('/', { method: 'POST' })],
    ['another site', { url: 'https://fonts.example/a.css', method: 'GET', mode: 'cors' }],
  ])('leaves %s alone', async (_name, req) => {
    const sw = await installed();
    expect((await sw.dispatch('fetch', { request: req })).response).toBeUndefined();
  });
});
