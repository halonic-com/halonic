import { expect, test } from "@playwright/test";

/**
 * The Inbox card of a run waiting at a plan limit (HAL-19051, flow C3 as board 10 draws it), for
 * the design check: `plan-limit-<waiting|reserve>-<width>-<light|dark>.png`, on a desktop and a
 * 390 px phone (docs/guides/e2e-screenshots.md). Nothing may scroll sideways on the phone.
 */
const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

const states = [
  { name: "waiting", title: "This run stopped: you've used this month's usage" },
  { name: "reserve", title: "This step can't start: not enough agent time left this month" },
] as const;

for (const size of sizes) {
  for (const scheme of ["light", "dark"] as const) {
    for (const state of states) {
      test(`plan limit, ${state.name}, ${size.width}, ${scheme}`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/plan-limit.html?state=${state.name}`);
        await expect(page.getByRole("heading", { name: state.title })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue the run" })).toBeVisible();
        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(sideways, "nothing scrolls sideways").toBe(false);
        await page.screenshot({
          path: `test-results/screenshots/plan-limit-${state.name}-${size.width}-${scheme}.png`,
          fullPage: true,
        });
      });
    }
  }
}
