const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: [
      '**/coverage/**',
      '**/design_handoff_nachopps/**',
      '**/dist/**',
      '**/docs-deprecated/**',
      '**/node_modules/**',
      '**/tmp/**',
      '**/src/generated/**',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs,ts,cts,mts,jsx,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      parser: tsParser,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.base.json',
          './apps/*/tsconfig.json',
          './libs/*/tsconfig.json',
          './apps/*-e2e/tsconfig.json',
          './libs/*/*/tsconfig.json'
        ],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      ...tsPlugin.configs?.['recommended-type-checked']?.rules,
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    // Test doubles (mocks/stubs/spies) routinely produce `any`-typed values and need
    // pragmatic typing to satisfy jest.fn()/vi.fn() signatures and partial service
    // shapes. The `no-unsafe-*`/`unbound-method`/`ban-ts-comment` family is pure noise
    // on a mock and drowns real signal. Relaxing SOLO en archivos de test mantiene el
    // código de producción estricto (allí estas reglas siguen activas). `no-unused-vars`
    // se mantiene: un import muerto es deuda real incluso en un test.
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      // Se mantiene la detección de código muerto (imports/vars sin usar), pero
      // se ignora el binding de catch sin usar: `catch (e)` para aseverar que algo
      // lanza es un patrón legítimo de test y no merece renombrar a `_e`.
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
];
