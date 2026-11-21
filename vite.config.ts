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
    // Files whose first line is `// @vitest-environment happy-dom` run with a simulated DOM.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Wiring only (real browser APIs and the real Leaflet); covered by the smoke test.
        'src/main.ts',
        'src/ui/map/leaflet.ts',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'html'],
      // Checked by `npm run coverage` only (not by `npm test` / CI).
      thresholds: {
        lines: 85,
        'src/domain/**': { lines: 90, branches: 85 },
      },
    },
  },
});
