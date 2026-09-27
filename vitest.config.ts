import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    // Integration tests spawn several CLI processes; 5 s is too short under full-suite load.
    testTimeout: 30_000,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'reports/vitest-junit.xml' },
    allowOnly: !process.env.CI,
  },
});
