import { defineWebViteConfig } from '@rexezuge/tooling/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The SPA build.
 *
 * The plugin list, the dev proxy and the shell-embedding step come from
 * `@rexezuge/tooling`. The shell writer was hand-written here and resolved its
 * output from `__dirname`, so the SPA had to live at exactly
 * `apps/web` relative to the repo root — moving the package would have silently
 * written `spa-shell.ts` somewhere no compiler reads, and the worker would have
 * kept serving the previous build's shell.
 *
 * `root` and `distIndex` are passed as `URL` objects rather than the `.href`
 * strings they are usually written as. Two reasons, one of which is a version
 * constraint rather than a preference:
 *
 * 1. `root` is passed explicitly because the factory falls back to
 *    `process.cwd()`, and `pnpm --filter … build` runs the script with the cwd
 *    set to the *package* directory — so the default would resolve
 *    `apps/api/src/generated/spa-shell.ts` under `apps/web/`.
 * 2. On `@rexezuge/tooling@1.7.2` the string form is mishandled: the factory
 *    runs `pathToFileURL` on anything that is not already a `URL`, so a
 *    file-URL string comes back as `file:///<cwd>/file:/srv/app` and the plugin
 *    reports "dist/index.html not found, skipping" — the same line a genuinely
 *    fresh checkout prints. Fixed upstream in SDK `294e5f0`; the `URL` form
 *    works on both, so this can become `.href` whenever the fix reaches a
 *    published version.
 */
const config = defineWebViteConfig({
  plugins: [react(), tailwindcss()],
  proxy: {
    '/api': { target: 'http://localhost:8787', changeOrigin: true },
  },
  spaShell: {
    path: 'apps/api/src/generated/spa-shell.ts',
    root: new URL('../../', import.meta.url),
    distIndex: new URL('dist/index.html', import.meta.url),
  },
});

export default {
  ...config,
  /**
   * Terser, with the two drops.
   *
   * Not in the factory: minifier choice and drop policy are this repo's, and a
   * shared default would be one no repo chose. `drop_console` matters because
   * the SPA's bundle is fetched by every signed-in operator, and `drop_debugger`
   * matters because a leftover `debugger` statement is a production hang for
   * whoever opens devtools on the deployed app.
   */
  build: {
    ...config.build,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
};
