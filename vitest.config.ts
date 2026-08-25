import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // UI/hooks are pinned by Playwright, not Vitest line coverage.
      include: ['src/engine/**', 'src/server/**', 'src/app/api/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/engine/test-utils.ts',
      ],
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        // Floors at the 2026-08-24 characterization baseline (a hair under).
        lines: 94,
        statements: 93,
        functions: 90,
        branches: 82,
      },
    },
  },
});
