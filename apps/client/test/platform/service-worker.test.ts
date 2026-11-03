// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../../src/platform/service-worker';

describe('registerServiceWorker', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('registers even when the page finished loading before main.ts got here (top-level await)', () => {
    vi.stubEnv('PROD', true);
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    registerServiceWorker();
    expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
  });

  it('waits for load while the page is still loading', () => {
    vi.stubEnv('PROD', true);
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
    dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledTimes(1);
  });
});
