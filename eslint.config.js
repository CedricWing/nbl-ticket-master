import js from '@eslint/js';
import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/out/**', '**/node_modules/**', '**/drizzle/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/ticketing-web/**/*.{ts,tsx,js,jsx}'],
    extends: [...nextVitals, ...nextTs],
    // eslint-config-next detects the app's root relative to ESLint's CWD, which is the repo
    // root in this monorepo, not apps/ticketing-web — point it at the real location.
    settings: { next: { rootDir: 'apps/ticketing-web' } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-trailing-spaces': 'error',
      semi: ['error', 'always'],
    },
  },
  {
    // Each feature module (src/modules/<name>/) exposes exactly one public entry point:
    // its index.ts. A module's own files import each other with plain relative paths
    // (./schema.js, ./service.js) — only a *cross*-module import looks like ../<name>/<file>,
    // so this pattern only ever catches reaching past another module's barrel, never a
    // module's own internals. schema.ts files are exempted below.
    files: ['apps/*/src/modules/**/*.ts'],
    ignores: ['apps/*/src/modules/**/schema.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../*/schema.js',
                '../*/service.js',
                '../*/repository.js',
                '../*/router.js',
                '../*/decorators.js',
                '../*/types.js',
              ],
              message:
                "Cross-module imports must go through the other module's index.ts (its public API), not its internal files directly.",
            },
          ],
        },
      ],
    },
  },
  {
    // schema.ts may import another module's schema.js directly, bypassing its index.ts. This
    // is a deliberate, narrow exception: index.ts barrels can also re-export service-layer
    // functions that depend on the live DB client, and the DB client itself depends on every
    // module's schema (shared/database/index.ts combines them). If a schema.ts pulled in
    // another module's full barrel, it could transitively reach the DB client and cycle back
    // to itself — schema definitions must stay a dependency-free, acyclic foundational layer.
    files: ['apps/*/src/modules/**/schema.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../*/service.js',
                '../*/repository.js',
                '../*/router.js',
                '../*/decorators.js',
                '../*/types.js',
              ],
              message:
                "Cross-module imports must go through the other module's index.ts (its public API), not its internal files directly — except another module's schema.js, which schema.ts files may import directly.",
            },
          ],
        },
      ],
    },
  },
);
