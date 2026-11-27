import { expect, test } from "@playwright/test";

/**
 * G8's wait card and G13's phone tab bar from the first-run polish (HAL-19399), for the house-style
 * check: `first-run-<wait-card|tab-bar>-<width>-<light|dark>.png` at 1440×900 and 390×844
 * (docs/guides/e2e-screenshots.md). The wait card is drawn as on a phone at 390.
 */
const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

for (const size of sizes) {
  for (const scheme of ["light", "dark"] as const) {
    test(`first-run wait card, ${size.width}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      const phone = size.width < 600 ? "&phone" : "";
      await page.goto(`/first-run-polish.html?screen=wait-card${phone}`);
      await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/first-run-wait-card-${size.width}-${scheme}.png`,
        fullPage: true,
      });
    });

    test(`first-run tab bar, ${size.width}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/first-run-polish.html?screen=tab-bar");
      await expect(page.getByRole("navigation")).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/first-run-tab-bar-${size.width}-${scheme}.png`,
        fullPage: true,
      });
    });
  }
}
