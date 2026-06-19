import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  reporter: 'list',
  webServer: {
    command: 'pnpm run build && pnpm start',
    cwd: '.',
    timeout: 60_000,
    reuseExistingServer: false,
  },
})
