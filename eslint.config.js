import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Browser code
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },

  // Node scripts and config files
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  // Layer boundaries (see refactor plan §3 and §8).
  // domain/ and state/ must stay platform-free so they can be reused
  // in a PWA, Capacitor or React Native app.
  {
    files: ['src/domain/**/*.ts', 'src/state/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'fetch', 'L'].map(
          (name) => ({
            name,
            message:
              'domain/ and state/ must not touch platform APIs. Inject them through services/, storage/ or platform/.',
          }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['leaflet', '**/ui/**', '**/storage/**', '**/platform/**'],
              message: 'domain/ and state/ must not depend on UI, storage or platform code.',
            },
          ],
        },
      ],
    },
  },

  // domain/ is pure: it must not even call services.
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'leaflet',
                '**/ui/**',
                '**/storage/**',
                '**/platform/**',
                '**/services/**',
                '**/state/**',
              ],
              message: 'domain/ is pure: it may only import from config/ and other domain/ files.',
            },
          ],
        },
      ],
    },
  },

  // Must be last: turns off rules that conflict with Prettier.
  prettier,
);
