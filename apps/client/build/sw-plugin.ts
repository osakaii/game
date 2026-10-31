import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const SW_FILE = 'sw.js';

/**
 * Что кладём в кэш при установке: все файлы сборки, кроме `lazy`. index.html — под адресом `/`: так его просит
 * браузер, и с `?room=CODE` service worker отдаёт ту же страницу. Сам sw.js — нет: его браузер
 * всегда берёт с сервера, иначе обновление никогда бы не пришло.
 */
export function precacheList(files: readonly string[], lazy: ReadonlySet<string> = new Set()): string[] {
  return files
    .filter((file) => file !== SW_FILE && !file.startsWith('.') && !lazy.has(file))
    .map((file) => (file === 'index.html' ? '/' : `/${file}`))
    .sort();
}

/**
 * Имя кэша — хэш содержимого всех файлов: поменялся хоть байт — новый кэш, старый удалится.
 * А изменившийся sw.js браузер сам считает новой версией service worker и ставит её.
 */
export function cacheName(contents: ReadonlyMap<string, Buffer | string>): string {
  const hash = createHash('sha256');
  for (const name of [...contents.keys()].sort()) hash.update(name).update('\0').update(contents.get(name)!);
  return `mecha-${hash.digest('hex').slice(0, 12)}`;
}

/** Готовый sw.js: шаблон + две строки с данными сборки сверху. */
export function serviceWorkerSource(template: string, precache: readonly string[], cache: string): string {
  return `self.__MECHA_PRECACHE__ = ${JSON.stringify(precache)};\nself.__MECHA_CACHE__ = ${JSON.stringify(cache)};\n${template}`;
}

/** Что нужно знать о чанке сборки: кто его грузит сразу (`imports`), а кто — по требованию. */
export interface ChunkInfo {
  type: 'chunk';
  fileName: string;
  name: string;
  isEntry: boolean;
  imports: readonly string[];
}

/**
 * Чанки, которые грузятся только по требованию (карты комнат): при установке их не качаем —
 * телефон скачает карту, когда в неё войдут, и тогда же положит в кэш. Исключение — `eager`
 * (карта главного экрана): без неё игра не откроется, если сервер спит.
 */
export function lazyChunks(chunks: readonly ChunkInfo[], eager: readonly string[]): Set<string> {
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const needed = new Set<string>();
  const visit = (file: string) => {
    if (needed.has(file)) return;
    needed.add(file);
    for (const next of byFile.get(file)?.imports ?? []) visit(next);
  };
  for (const chunk of chunks) if (chunk.isEntry || eager.includes(chunk.name)) visit(chunk.fileName);
  return new Set(chunks.map((chunk) => chunk.fileName).filter((file) => !needed.has(file)));
}

/** Все файлы папки с подпапками — путями от её корня. */
function listFiles(root: string, dir = root): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(root, path) : [relative(root, path)];
  });
}

/**
 * Плагин Vite: после сборки пишет `dist/sw.js`. Смотрим на готовую папку, а не на бандл:
 * в ней уже есть и файлы из public/ (иконки, manifest), и index.html.
 */
export function serviceWorker(templatePath: string, eager: readonly string[] = []): Plugin {
  let outDir = '';
  return {
    name: 'mecha-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item): item is ChunkInfo & typeof item => item.type === 'chunk');
      const lazy = lazyChunks(chunks, eager);
      const files = listFiles(outDir)
        .map((file) => file.split(sep).join('/'))
        .filter((file) => file !== SW_FILE);
      const contents = new Map(files.map((file) => [file, readFileSync(join(outDir, file))]));
      const source = serviceWorkerSource(readFileSync(templatePath, 'utf8'), precacheList(files, lazy), cacheName(contents));
      writeFileSync(join(outDir, SW_FILE), source);
    },
  };
}
