import { defineConfig, devices } from '@playwright/test'

const vite = 'http://localhost:4173'
const nuxt = 'http://localhost:3000'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: 'pnpm --filter playground build && pnpm --filter playground preview --port 4173 --strictPort',
      url: vite,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter playground-nuxt build && PORT=3000 node playground-nuxt/.output/server/index.mjs',
      url: nuxt,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  projects: [
    ...(['Desktop Chrome', 'Desktop Firefox', 'Desktop Safari'] as const).map(d => ({
      name: d.split(' ')[1]!.toLowerCase(),
      testIgnore: /nuxt\.spec/,
      use: {
        ...devices[d],
        baseURL: vite,
        // Headless Firefox on GPU-less Linux CI disables WebGL; force software WebGL.
        ...(d === 'Desktop Firefox' && {
          launchOptions: {
            firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false },
          },
        }),
      },
    })),
    {
      name: 'nuxt',
      testMatch: /nuxt\.spec/,
      use: { ...devices['Desktop Chrome'], baseURL: nuxt },
    },
  ],
})
