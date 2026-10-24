// End-to-end tests of the critical flows (e2e/). They run only against the demo app started here,
// in its isolated mode: APP_ENV=e2e with the fake AI provider (src/web/server.ts refuses anything else),
// and every browser request outside this server is blocked (e2e/fixtures.ts). AI quality is the evals' job.
// Docs: https://playwright.dev/docs/test-configuration (pinned @playwright/test 1.64.1).

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  // The tests use only e2e/tsconfig.json (CI and npm run e2e also pass --tsconfig, which covers this file too).
  tsconfig: "./e2e/tsconfig.json",
  fullyParallel: false,
  forbidOnly: true,
  // In CI a test that passes only on a retry is reported as flaky (see docs/WORKFLOW.md, "End-to-end tests").
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Only for machines with a preinstalled Chromium of another revision; CI installs its own.
        ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
      },
    },
  ],
  webServer: {
    command: "node src/web/server.ts",
    url: `http://127.0.0.1:${PORT}`,
    env: { APP_ENV: "e2e", LLM_PROVIDER: "mock", PORT: String(PORT) },
    // Never reuse a server that is already running: it could be configured with a real provider.
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
