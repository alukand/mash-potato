import { defineConfig } from 'vitest/config'

// Scoring core is pure logic, so tests run in the fast Node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
