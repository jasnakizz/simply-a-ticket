import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Test-only: swap the `server-only` marker (which throws on import
      // outside a React Server Component) for an empty stub, so node tests can
      // import server-marked modules such as src/lib/email.ts and assert on the
      // real assembled HTML. This is Vite/vitest module resolution only —
      // Next.js never reads this file, so the production import guard is
      // untouched. See test/stubs/server-only.ts.
      'server-only': path.resolve(__dirname, './test/stubs/server-only.ts'),
    },
  },
});
