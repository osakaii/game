#!/usr/bin/env node
/**
 * Выпуск новой версии: pnpm release <major|minor|patch>
 *
 * 1. Поднимает версию по SemVer во всех package.json и в packages/shared/src/version.ts.
 * 2. Переносит раздел «Unreleased» в CHANGELOG.md под новый номер с сегодняшней датой.
 *
 * Коммит и git-тег не создаёт — проверь изменения и сделай их сам (команды подскажет в конце).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGES = ['package.json', 'apps/client/package.json', 'apps/server/package.json', 'packages/shared/package.json'];
const VERSION_FILE = 'packages/shared/src/version.ts';
const CHANGELOG = 'CHANGELOG.md';

const kind = process.argv[2];
if (!['major', 'minor', 'patch'].includes(kind)) {
  console.error('Использование: pnpm release <major|minor|patch>');
  process.exit(1);
}

const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
const [major, minor, patch] = current.split('.').map(Number);
const next =
  kind === 'major' ? `${major + 1}.0.0` : kind === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;

const changelog = readFileSync(CHANGELOG, 'utf8');
const unreleased = changelog.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[)/);
if (!unreleased || !unreleased[1].trim()) {
  console.error('В CHANGELOG.md пустой раздел [Unreleased] — опиши изменения перед выпуском версии.');
  process.exit(1);
}

for (const path of PACKAGES) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.version = next;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

const versionSource = readFileSync(VERSION_FILE, 'utf8');
writeFileSync(VERSION_FILE, versionSource.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${next}'`));

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  CHANGELOG,
  changelog.replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${next}] — ${today}\n`),
);

console.log(`Версия: ${current} → ${next}\n`);
console.log('Дальше:');
console.log('  pnpm test');
console.log(`  git commit -am "chore: release v${next}"`);
console.log(`  git tag v${next}`);
console.log('  git push origin main --tags');
