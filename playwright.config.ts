import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: "http://127.0.0.1:5180",
    launchOptions: { channel: "chrome" },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node scripts/start-fixture.mjs",
      env: { FIXTURE_PORT: "17880" },
      url: "http://127.0.0.1:17880/health",
      timeout: 30000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5180",
      url: "http://127.0.0.1:5180",
      env: { RUNTIME_URL: "http://127.0.0.1:17880" },
      timeout: 30000,
      reuseExistingServer: false,
    },
  ],
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
});
