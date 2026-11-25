import { expect, type Page, test } from "@playwright/test";

/**
 * The Pull requests screen (HAL-18328, HAL-18341), from a made-up repo, for the design check
 * against HAL-17515's P1–P10 and P18–P22: `pull-requests-<state>-<width>-<look>.png`, on a desktop and a 390 px phone,
 * in light, dark and high contrast (docs/guides/e2e-screenshots.md). On the phone nothing scrolls
 * sideways, however long a title is.
 */
const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const looks = ["light", "dark", "high-contrast"] as const;

/** Each state, the page's `?state=`, the tab the spec presses, and words it shows once drawn. */
const states = [
  { name: "attention", query: "attention", shows: "Merge queue: Running" },
  { name: "all-open", query: "attention", tab: /All open/, shows: "Conflicting" },
  { name: "queue", query: "attention", tab: /Queue/, shows: "Waiting to enter" },
  { name: "merged", query: "attention", tab: /Merged today/, shows: "Merged 12:20" },
  { name: "runners-busy", query: "runners-busy", shows: "Runners busy" },
  { name: "queue-empty", query: "queue-empty", tab: /Queue/, shows: "The merge queue is empty." },
  { name: "old", query: "old", shows: "The PR watcher may have stopped." },
  { name: "loading", query: "loading", shows: "Loading…" },
  { name: "failed", query: "failed", shows: "Paperclip isn't answering." },
  { name: "no-snapshot", query: "no-snapshot", shows: "PR states aren't available yet." },
  { name: "no-access", query: "no-access", shows: "This connection can't read pull requests yet." },
] as const;

async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

for (const size of sizes) {
  for (const look of looks) {
    test(`pull requests, ${size.width}x${size.height}, ${look}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia(
        look === "high-contrast"
          ? { colorScheme: "light", forcedColors: "active" }
          : { colorScheme: look, forcedColors: "none" },
      );
      for (const state of states) {
        await page.goto(`/pull-requests.html?state=${state.query}`);
        await expect(page.getByRole("heading", { level: 1 })).toContainText("Pull requests");
        if ("tab" in state) await page.getByRole("tab", { name: state.tab }).click();
        await expect(page.getByText(state.shows, { exact: false }).first()).toBeVisible();
        expect(await scrollsSideways(page), "nothing scrolls sideways").toBe(false);
        await page.screenshot({
          path: `test-results/screenshots/pull-requests-${state.name}-${size.width}-${look}.png`,
          fullPage: true,
        });
      }
    });
  }
}
