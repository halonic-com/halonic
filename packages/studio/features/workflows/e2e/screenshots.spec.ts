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
