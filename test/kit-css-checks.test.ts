import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkKitCss, KIT_REQUIRED_CSS_TOKENS } from '../scripts/build/kit-css-checks';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every file Tailwind's automatic source detection can read for the SPA.
 *
 * Its scan root is the Vite root, `apps/web`, and it reads any text file there
 * *except* what `.gitignore` excludes — so Markdown and config files are candidates
 * alongside JSX, while `node_modules` and `dist` are not. Walking this set is what
 * turns "this token can only come from the kit" into a checked statement rather than
 * a comment.
 */
function readAppWeb(): Array<{ file: string; text: string }> {
  const skip = new Set(['node_modules', 'dist']);
  const found: Array<{ file: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        found.push({ file: path.relative(REPO_ROOT, full), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(path.join(REPO_ROOT, 'apps/web'));
  return found;
}

/**
 * Escape a token for literal use inside a `RegExp`.
 *
 * Several guarded utilities are arbitrary-value ones, full of `[`, `(` and `:`,
 * every one of which means something to a pattern.
 */
const escapeForRegExp = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Which of `tokens` some file under the scan root already names.
 *
 * What disqualifies a token is a *class name*, which the scanner reads as a
 * candidate and Tailwind then emits. Three ways a file can carry one, all checked:
 * as a JSX `className` / `class` attribute value; inside a quoted string, which is
 * where `cn(...)`, template literals and CVA variant tables put classes; or as a
 * *selector*, i.e. with a leading `.` and a brace after it.
 *
 * Two things deliberately do **not** count. A theme variable
 * (`--animate-spin: spin 1s linear infinite`, declared in this app's own `@theme`
 * block) shares a token's text but emits no utility, so it cannot satisfy the gate
 * and must not be reported as an offender. Nor does a bare mention in prose: the
 * scanner ignores `*`, and Tailwind escapes `:` inside a selector, so the shipped
 * form of a variant utility carries no unescaped colon either. `apps/web/AGENTS.md`
 * is therefore free to name controls and symptoms without naming utilities.
 */
function tokensNamedUnder(files: Array<{ file: string; text: string }>, tokens: readonly string[]): string[] {
  const named = (text: string, token: string): boolean => {
    const classAttribute = /(?:className|class)\s*=\s*["'`]([^"'`]*)/g;
    for (const attribute of text.matchAll(classAttribute)) {
      if ((attribute[1] ?? '').includes(token)) return true;
    }
    const quoted = /["'`]([^"'`]+)["'`]/g;
    for (const value of text.matchAll(quoted)) {
      if ((value[1] ?? '').includes(token)) return true;
    }
    return new RegExp(String.raw`\.${escapeForRegExp(token)}\s*[,{]`).test(text);
  };
  return tokens.filter((token) => files.some(({ text }) => named(text, token)));
}

describe('checkKitCss', () => {
  /**
   * A bundle that really carries every token, as class selectors.
   */
  const fullBundle = () => KIT_REQUIRED_CSS_TOKENS.map((token) => `.${token}{color:red}`).join('\n');

  it('passes when every kit utility is present as a selector', () => {
    expect(checkKitCss(fullBundle())).toHaveLength(0);
  });

  it('reads a token out of the Tailwind escape form', () => {
    // What Vite actually writes for an arbitrary-value utility: the brackets, the
    // parens and the `:` are all backslash-escaped inside the selector. Neither may
    // be reported as missing, or the gate would fail on a correct build.
    const bundle = String.raw`.max-w-\[calc\(100vw-2rem\)\]{max-width:calc(100vw - 2rem)}.focus-visible\:outline-2{outline-width:2px}`;
    const detail = checkKitCss(bundle).join('\n');
    expect(detail).not.toContain('max-w-[calc(100vw-2rem)]');
    expect(detail).not.toContain('focus-visible:outline-2');
  });

  it('does not accept a theme variable in place of a utility', () => {
    // The bug this guards: Tailwind emits `--animate-spin` from its default theme
    // whether or not any component uses it, so a substring match calls a frozen
    // spinner present. Only a `.`-prefixed selector counts.
    expect(checkKitCss(':root{--animate-spin:spin 1s linear infinite}')).toHaveLength(1);
  });

  it('reports the missing token names', () => {
    const omitted = KIT_REQUIRED_CSS_TOKENS[0];
    const css = KIT_REQUIRED_CSS_TOKENS.filter((token) => token !== omitted)
      .map((token) => `.${token}{color:red}`)
      .join('\n');
    const problems = checkKitCss(css);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(omitted);
    expect(problems[0]).toContain('@source');
  });

  it('names a missing bundle rather than reporting every token', () => {
    // A build that did not run is a different problem from a build that lost the kit,
    // and an operator fixing one should not be sent to the other.
    const problems = checkKitCss(null);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('apps/web/dist/assets');
  });

  it('has no token this repository itself writes into the scan root', () => {
    // Tailwind's scan root is `apps/web/**` and it reads Markdown as readily as JSX, so
    // a token named anywhere under there is compiled into the bundle whether or not the
    // kit is a source — and this gate would pass with the `@source` line deleted. A doc
    // edit must not be able to disarm it silently.
    expect(tokensNamedUnder(readAppWeb(), KIT_REQUIRED_CSS_TOKENS)).toEqual([]);
  });
});
