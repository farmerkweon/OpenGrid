import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // '**/node_modules/**' 로 적어야 하위 폴더(angular/ 빌드 작업 공간 등)의 node_modules 까지 걸러진다.
    exclude: ['**/node_modules/**', 'test/e2e/**', 'sessions/**', 'angular/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.vue', 'src/**/*.tsx'],
    },
  },
});
