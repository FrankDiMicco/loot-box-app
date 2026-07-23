import { defineConfig } from 'vitest/config';

// Scoped to src/ so vitest never picks up scripts/rules.test.mjs, which is a
// standalone harness run against the Firestore emulator (npm run test:rules),
// not a vitest suite. Node environment: the utils under test are pure — the
// storage layer they import only touches localStorage inside try/catch.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
