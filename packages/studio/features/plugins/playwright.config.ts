import { defineConfig, devices } from "@playwright/test";

/** The port the e2e page is served on; the shell uses 4174 and Workflows 4175. */
const port = 4176;

/**
 * This feature's end-to-end run (`pnpm e2e`): the plugin flow in Chromium, from Add plugin to
 * Remove plugin, over the feature's real views and an in-memory host (HAL-1740), and the
 * screenshots of each step for the `studio-screenshots` artifact.
 *
 * Only CI runs it, in the `e2e` job, which installs the browsers. Don't run it on the shared
 * runner (HAL-2418). The web server builds the page (vite.config.ts) and serves the build with
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
    url: `http://127.0.0.1:${port}/flow.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
