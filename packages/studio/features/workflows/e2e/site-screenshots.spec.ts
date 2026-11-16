import { expect, test } from "@playwright/test";

/**
 * Pictures of Studio for halonic.dev (HAL-10732): the run page of a made-up Review pull request
 * run, and the Inbox card that asks "Publish the review?". Unlike the reviewer's screenshots in
 * `screenshots.spec.ts` they are cropped to the screen's content, at 2x, with names that don't
 * change: `run-steps-light.png`, `run-steps-dark.png`, `approval-light.png`, `approval-dark.png`.
 * CI's `e2e` job uploads them in the `studio-screenshots` artifact. All data is invented.
 */

const screens = [
  { name: "run-steps", page: "/run-steps.html", shown: /Publish the review\?/ },
  { name: "approval", page: "/approval.html", shown: /Publish the review\?/ },
] as const;
const schemes = ["light", "dark"] as const;

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

for (const screen of screens) {
  for (const scheme of schemes) {
    test(`${screen.name} for the site, ${scheme}`, async ({ page }) => {
      const problems: string[] = [];
      page.on("pageerror", (error) =>
        problems.push(`${error.message} @ ${(error.stack ?? "").slice(0, 600)}`),
      );
      page.on("console", (message) =>
        problems.push(`console ${message.type()}: ${message.text()}`),
      );
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(screen.page);
      const shot = page.locator("#shot");
      await expect(
        shot.getByText(screen.shown).first(),
        problems.join("; ") || "the page threw nothing",
      ).toBeVisible();
      // The card focuses its title when it opens: that ring is for a keyboard, not a picture.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await shot.screenshot({ path: `test-results/screenshots/${screen.name}-${scheme}.png` });
    });
  }
}
