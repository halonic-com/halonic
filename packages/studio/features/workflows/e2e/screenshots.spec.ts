import { expect, test } from "@playwright/test";

/**
 * Screenshots of Studio's screens for a pull request's reviewer, who has no browser (HAL-10393):
 * one full-page PNG per screen, state and colour scheme, in `test-results/screenshots/`, which CI's
 * `e2e` job uploads as the `studio-screenshots` artifact. They are looked at, not compared: the
 * only check is that the screen is shown.
 *
 * To add a screen, add its page in `e2e/pages` (and to `vite.config.ts`), then add its states below.
 */

const states = ["finished", "waiting", "failed"] as const;
const schemes = ["light", "dark"] as const;

test.use({ viewport: { width: 1440, height: 900 } });

for (const state of states) {
  for (const scheme of schemes) {
    test(`run card, ${state}, ${scheme}`, async ({ page }) => {
      const problems: string[] = [];
      page.on("pageerror", (error) =>
        problems.push(`${error.message} @ ${(error.stack ?? "").slice(0, 600)}`),
      );
      page.on("console", (message) =>
        problems.push(`console ${message.type()}: ${message.text()}`),
      );
      page.on("requestfailed", (request) => problems.push(`${request.url()} failed`));
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/run-card.html?state=${state}`);
      await expect(
        page.getByRole("complementary", { name: "Run 01jd8q" }),
        problems.join("; ") || "the page threw nothing",
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/run-card-${state}-${scheme}.png`,
        fullPage: true,
      });
    });
  }
}

/**
 * The first-start sandbox choice (HAL-5405) on a Windows PC, at the window sizes the plan names
 * (HAL-3777): the halo must stay partly visible around the card at each. Every screen at the largest
 * size, and the first screen at the others.
 */
const sizes = [
  { width: 1280, height: 800 },
  { width: 1000, height: 700 },
  { width: 720, height: 560 },
  { width: 480, height: 640 },
] as const;
const choiceScreens = ["choose", "more-info", "options", "confirm-none"] as const;

for (const size of sizes) {
  for (const screen of choiceScreens) {
    if (screen !== "choose" && size !== sizes[0]) continue;
    for (const scheme of schemes) {
      test(`sandbox choice, ${screen}, ${size.width}x${size.height}, ${scheme}`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/sandbox-choice.html?screen=${screen}`);
        await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
        await expect(page.getByTestId("sandbox-halo")).toBeAttached();
        await page.screenshot({
          path: `test-results/screenshots/sandbox-choice-${screen}-${size.width}x${size.height}-${scheme}.png`,
          fullPage: true,
        });
      });
    }
  }
}
