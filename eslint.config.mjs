import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['app/dist/**', 'apps/web/dist/**', 'src/generated/**', 'apps/api/src/generated/**'] },
  { files: ['**/*.js'], languageOptions: { sourceType: 'script' } },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
