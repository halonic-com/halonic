import { expect, test } from "@playwright/test";

/**
 * The Spend and seats screen (HAL-17853), from made-up seats, for the design check against
 * HAL-17515's s01, s06, s08 and S24: `spend-and-seats-<glance|loading>-<width>-<look>.png`, on a
 * desktop and a 390 px phone, in light, dark and high contrast (docs/guides/e2e-screenshots.md).
 * On the phone the tiles are rows under Money and seats, and nothing scrolls sideways.
 */
const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const looks = ["light", "dark", "high-contrast"] as const;
const states = ["glance", "loading"] as const;

for (const size of sizes) {
  for (const look of looks) {
    test(`spend and seats, ${size.width}x${size.height}, ${look}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia(
        look === "high-contrast"
          ? { colorScheme: "light", forcedColors: "active" }
          : { colorScheme: look, forcedColors: "none" },
      );
      for (const state of states) {
        await page.goto(`/spend-and-seats.html?state=${state}`);
        await expect(
          page.getByRole("heading", { name: "Spend and seats", level: 1 }),
        ).toBeVisible();
        if (state === "glance") {
          await expect(page.getByText("Seat B reaches 90% of its week around 13:40")).toBeVisible();
          const sideways = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          );
          expect(sideways, "nothing scrolls sideways").toBe(false);
        }
        await page.screenshot({
          path: `test-results/screenshots/spend-and-seats-${state}-${size.width}-${look}.png`,
          fullPage: true,
        });
      }
    });
  }
}
