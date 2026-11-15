import { defineConfig, devices } from "@playwright/test";

/** The port the e2e pages are served on; the shell's e2e pages use 4174. */
const port = 4175;

/**
 * This feature's end-to-end run (`pnpm e2e`): screenshots of its screens in Chromium, for a pull
 * request's reviewer. They sit here, not in the shell, because the shell can't import a feature.
 *
 * Only CI runs it, in the `e2e` job, which installs the browsers. Don't run it on the shared
 * runner (HAL-2418). The web server builds the pages (vite.config.ts) and serves the build with
 * `vite preview`; Playwright stops it when the tests end.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/runs",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vite build && vite preview --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/run-card.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
