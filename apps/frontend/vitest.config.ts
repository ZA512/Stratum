import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.tsx'],
    globals: true,
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
