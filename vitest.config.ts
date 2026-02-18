import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    env: {
      JWT_SECRET: 'test-secret-key-for-vitest',
    },
  },
});
