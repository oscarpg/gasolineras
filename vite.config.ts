import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
// so every asset URL must be prefixed with the repository name.
const REPO_BASE = '/gasolineras/';

export default defineConfig({
  base: REPO_BASE,
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
