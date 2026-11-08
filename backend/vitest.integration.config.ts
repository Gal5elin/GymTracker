import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point to a separate database whose name ends in _test');
}
if (process.env.DATABASE_URL && new URL(testUrl).pathname === new URL(process.env.DATABASE_URL).pathname) {
  throw new Error('The test database must differ from the development database');
}
process.env.DATABASE_URL = testUrl;

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.integration.test.ts'], fileParallelism: false },
});
