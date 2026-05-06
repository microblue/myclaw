import { defineConfig, devices } from '@playwright/test'

// E2E config. Defaults to running against production myclaw.one (smoke
// only — read-only assertions on public surfaces). For local dev, set
// PLAYWRIGHT_BASE_URL=http://localhost:1111 before invoking.
//
// As tests grow beyond smoke (P1 RBAC scenarios etc.) this will switch
// to spinning up a local stack via the `webServer` block, but for the
// initial T0 baseline a remote smoke is enough to prove the harness.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://myclaw.one'

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ]
})