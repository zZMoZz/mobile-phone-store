import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/**/*.test.js'],
    environment: 'node',
    // Each test file gets an isolated SQLite file via helpers.js, so run files
    // in separate processes to avoid module-level DB singleton collisions.
    pool: 'forks',
    fileParallelism: false,
  },
});
