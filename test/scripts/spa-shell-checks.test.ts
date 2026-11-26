import { describe, expect, it } from 'vitest';
import {
  checkShell,
  checkCss,
  MIN_HTML_BYTES,
  readEmbeddedHtml,
  referencedAssets,
  SPA_HTML_MARKER,
} from '../../scripts/build/spa-shell-checks';

/**
 * The shell checks, as rules.
 *
 * The whole point of this check is that the Worker serves the SPA shell embedded from
 * a gitignored build artifact, so a wrong one is a blank page with nothing in the
 * source tree saying so. Each finding is an operator's only clue, and the failure
 * mode of the check itself is silently passing.
 */
function shellSource(html: string): string {
  return `// Auto-generated\nexport const SPA_HTML: string = ${JSON.stringify(html)};\n`;
}

const REAL_HTML = [
  '<!doctype html><html lang="en"><head>',
  '<meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<title>Mail-Otter</title>',
  '</head><body>',
  '<div id="root"></div>',
  '<script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '</body></html>',
].join('');

describe('readEmbeddedHtml', () => {
  it('clears its own size threshold, so the fixtures below test what they claim', () => {
    expect(REAL_HTML.length).toBeGreaterThan(MIN_HTML_BYTES);
  });

  it('decodes a real build output', () => {
    expect(readEmbeddedHtml(shellSource(REAL_HTML))).toEqual({ html: REAL_HTML, problems: [] });
  });

  it('names the empty postinstall stub rather than reporting it as malformed', () => {
    const result = readEmbeddedHtml(`${SPA_HTML_MARKER}'';`);
    expect(result.html).toBeNull();
    expect(result.problems.map((problem) => problem.code)).toEqual(['stub']);
    expect(result.problems[0]?.detail).toContain('pnpm run build');
  });

  it('names a module that does not export SPA_HTML', () => {
    expect(readEmbeddedHtml('export const SOMETHING_ELSE = 1;').problems.map((problem) => problem.code)).toEqual(['unexported']);
  });

  it('names a value that is too short to be a page', () => {
    const result = readEmbeddedHtml(shellSource('<!doctype html>'));
    expect(result.problems.map((problem) => problem.code)).toEqual(['too-small']);
    expect(result.problems[0]?.detail).toContain('15 chars');
  });

  it('names a literal that is not a string, rather than throwing on `.length`', () => {
    expect(readEmbeddedHtml(`${SPA_HTML_MARKER}42;`).problems.map((problem) => problem.code)).toEqual(['malformed']);
  });

  it('names a literal that does not parse', () => {
    expect(readEmbeddedHtml(`${SPA_HTML_MARKER}'not json';`).problems.map((problem) => problem.code)).toEqual(['malformed']);
  });

  it('accepts a shell with no leading marker comment', () => {
    expect(readEmbeddedHtml(shellSource(REAL_HTML)).html).toBe(REAL_HTML);
  });
});

describe('referencedAssets', () => {
  it('collects same-origin asset paths, deduped', () => {
    const html = '<script src="/assets/a.js"></script><link href="/assets/a.css"><script src="/assets/b.js">';
    expect(referencedAssets(html).toSorted((left, right) => left.localeCompare(right))).toEqual(['a.css', 'a.js', 'b.js']);
  });

  it('ignores an absolute URL, which dist/assets cannot be expected to hold', () => {
    expect(referencedAssets('<script src="https://cdn.example.com/a.js">')).toEqual([]);
  });
});

describe('checkShell', () => {
  const has = (names: string[]) => (asset: string) => names.includes(asset);

  it('passes when the shell, its assets and dist agree', () => {
    expect(checkShell(shellSource(REAL_HTML), REAL_HTML, has(['index-abc123.js']))).toEqual([]);
  });

  it('names a missing shell and stops, because there is nothing to check against', () => {
    expect(checkShell(null, REAL_HTML, has([])).map((problem) => problem.code)).toEqual(['missing']);
  });

  it('names the empty-string stub that the postinstall script writes', () => {
    // What `scripts/ensure-spa-shell-stub.mjs` actually writes on a fresh clone.
    const stub = "// Auto-generated stub - real content is produced by `npm run build` via the Vite plugin.\nexport const SPA_HTML: string = '';\n";
    expect(checkShell(stub, null, has([])).map((problem) => problem.code)).toEqual(['stub']);
  });

  it('names an asset the shell references but dist does not hold', () => {
    const problems = checkShell(shellSource(REAL_HTML), REAL_HTML, has([]));
    expect(problems.map((problem) => problem.code)).toEqual(['missing-asset']);
    expect(problems[0]?.detail).toContain('/assets/index-abc123.js');
  });

  it('names a shell referencing no bundles at all', () => {
    const html = `<!doctype html><html><body>${'x'.repeat(MIN_HTML_BYTES)}</body></html>`;
    expect(checkShell(shellSource(html), html, has([])).map((problem) => problem.code)).toEqual(['no-assets']);
  });

  it('names a disagreement between the two halves of the build', () => {
    const problems = checkShell(shellSource(REAL_HTML), `${REAL_HTML}<!-- rebuilt -->`, has(['index-abc123.js']));
    expect(problems.map((problem) => problem.code)).toEqual(['disagreement']);
  });

  it('names a missing dist, rather than reporting a disagreement with nothing', () => {
    expect(checkShell(shellSource(REAL_HTML), null, has(['index-abc123.js'])).map((problem) => problem.code)).toEqual(['dist-missing']);
  });

  it('reports every independent problem, not just the first', () => {
    const problems = checkShell(shellSource(REAL_HTML), null, has([]));
    expect(problems.map((problem) => problem.code).toSorted((left, right) => left.localeCompare(right))).toEqual([
      'dist-missing',
      'missing-asset',
    ]);
  });

  it('does not check assets against a shell it could not decode', () => {
    expect(checkShell(`${SPA_HTML_MARKER}'';`, null, has([])).map((problem) => problem.code)).toEqual(['stub']);
  });
});

describe('checkCss', () => {
  it('passes when a CSS bundle was emitted', () => {
    expect(checkCss('.card{color:red}')).toEqual([]);
  });

  it('names a missing bundle `missing-css`', () => {
    expect(checkCss(null).map((problem) => problem.code)).toEqual(['missing-css']);
  });
});
