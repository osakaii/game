import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Браузер не ругается на незакрытую скобку в CSS: он молча считает всё дальнейшее частью блока.
 * Так однажды потерялась «}» после `@media (pointer: fine)` — и больше половины стилей
 * работали только с мышью, а на телефоне кнопки позы и приседа исчезли. Ловим это здесь.
 */
const SRC = join(__dirname, '../src');
/** Заголовок раздела: «/* ---------- Мастерская ---------- *\/». Между разделами вложенности быть не должно. */
const SECTION = /^\/\* -{3,} .* -{3,} \*\/$/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

/** Ошибки вложенности: строка и что не так. Комментарии и строки в кавычках пропускаем — скобки в них не считаются. */
function braceProblems(css: string): string[] {
  const problems: string[] = [];
  const open: number[] = [];
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '\n') {
      line++;
      lineStart = i + 1;
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const comment = css.slice(i, end + 2);
      if (i === lineStart && SECTION.test(comment) && open.length > 0) {
        problems.push(`строка ${line}: раздел начинается внутри блока со строки ${open[open.length - 1]}`);
      }
      for (const c of comment) if (c === '\n') line++;
      i = end + 1;
    } else if (ch === '"' || ch === "'") {
      i = css.indexOf(ch, i + 1);
    } else if (ch === '{') {
      open.push(line);
    } else if (ch === '}') {
      if (!open.pop()) problems.push(`строка ${line}: лишняя «}»`);
    }
  }
  for (const at of open) problems.push(`строка ${at}: блок не закрыт`);
  return problems;
}

describe('CSS', () => {
  it('finds an unclosed block before the next section', () => {
    const css = '@media (pointer: fine) {\n  a { color: red; }\n\n/* ---------- Поиск ---------- */\nb { color: blue; }\n';
    expect(braceProblems(css)).toEqual(['строка 4: раздел начинается внутри блока со строки 1', 'строка 1: блок не закрыт']);
  });

  it('ignores braces in comments and strings', () => {
    expect(braceProblems('/* { */ a::after { content: "}"; }')).toEqual([]);
  });

  for (const file of cssFiles(SRC)) {
    it(`${file.slice(SRC.length + 1)} has balanced blocks`, () => {
      expect(braceProblems(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});
