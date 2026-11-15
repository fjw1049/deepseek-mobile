import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig(base, {
  use: { ...base.use, baseURL: 'http://127.0.0.1:5184' },
  outputDir: '/private/tmp/deepseek-mobile-completion-results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/completion-20261116/full-e2e.json' }]],
  webServer: [
    { command: 'node scripts/start-fixture.mjs', env: { FIXTURE_PORT: '17884' }, url: 'http://127.0.0.1:17884/health', timeout: 30000 },
    { command: 'npm run dev -- --port 5184', env: { RUNTIME_URL: 'http://127.0.0.1:17884' }, url: 'http://127.0.0.1:5184', timeout: 30000 },
  ],
});
