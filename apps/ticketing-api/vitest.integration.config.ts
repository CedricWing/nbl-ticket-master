import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    // Test files run serially in one process: the concurrency tests need a real Postgres
    // and rely on shared tables (teams/users seeded once), so racing test files against
    // each other would corrupt state independent of the actual code under test.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
