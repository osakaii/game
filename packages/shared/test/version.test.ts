import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, isUpdateAvailable } from '../src/version.js';

const versionOf = (path: string) =>
  (JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { version: string }).version;

describe('APP_VERSION', () => {
  it('is valid SemVer', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches every package.json in the monorepo', () => {
    for (const path of [
      '../../../package.json',
      '../package.json',
      '../../../apps/client/package.json',
      '../../../apps/server/package.json',
    ]) {
      expect(versionOf(path), path).toBe(APP_VERSION);
    }
  });

  it('has an entry in CHANGELOG.md', () => {
    const changelog = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
    expect(changelog).toContain(`## [${APP_VERSION}]`);
  });
});

describe('isUpdateAvailable', () => {
  it('detects a new version or a new commit of the same version', () => {
    expect(isUpdateAvailable({ version: '1.0.0', commit: 'aaa1111' }, { version: '1.1.0', commit: 'bbb2222' })).toBe(true);
    expect(isUpdateAvailable({ version: '1.0.0', commit: 'aaa1111' }, { version: '1.0.0', commit: 'bbb2222' })).toBe(true);
    expect(isUpdateAvailable({ version: '1.0.0', commit: 'aaa1111' }, { version: '1.0.0', commit: 'aaa1111' })).toBe(false);
  });

  it('ignores unknown commits in local development', () => {
    expect(isUpdateAvailable({ version: '1.0.0', commit: 'abc1234' }, { version: '1.0.0', commit: 'dev' })).toBe(false);
  });
});
