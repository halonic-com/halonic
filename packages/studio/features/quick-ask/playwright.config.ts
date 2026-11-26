import { defineConfig, devices } from "@playwright/test";

/** The port the e2e page is served on; the shell uses 4174, Workflows 4175 and Plugins 4176. */
const port = 4177;

/**
 * Quick ask's end-to-end run (`pnpm e2e`): the box laid out in a real Chromium, which jsdom can't
 * do, so a long answer is checked against the window's height (HAL-19213).
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
    url: `http://127.0.0.1:${port}/box.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
