import { expect, test } from "@playwright/test";

/**
 * G13's phone tab bar from the first-run polish (HAL-19399), for the house-style check:
 * `first-run-tab-bar-<count>-<light|dark>.png` at 390×844 with a one- and a two-digit count
 * (docs/guides/e2e-screenshots.md). The tab bar is phone-only, so there is no desktop size.
 */
for (const count of [1, 12]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`first-run tab bar, count ${count}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/first-run-polish.html?count=${count}`);
      await expect(page.getByRole("navigation")).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/first-run-tab-bar-${count}-${scheme}.png`,
        fullPage: true,
      });
    });
  }
}
