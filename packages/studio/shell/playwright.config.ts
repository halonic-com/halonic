import { defineConfig, devices } from "@playwright/test";

/** The port the e2e pages are served on; the kit's states page keeps Vite's own 5173. */
const port = 4174;

/**
 * The shell's end-to-end tests (`pnpm e2e`): what jsdom can't show, such as a tab dragged with a
 * real pointer, checked in a real Chromium against the pages in e2e/pages.
 *
 * Only CI runs them, in the `e2e` job, which installs the browser. Don't run them on the shared
 * runner (HAL-2418). The web server below builds the pages (vite.config.ts) and serves the build
 * with `vite preview`; Playwright stops it when the tests end.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/runs",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/report" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vite build && vite preview --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tab-strip.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
