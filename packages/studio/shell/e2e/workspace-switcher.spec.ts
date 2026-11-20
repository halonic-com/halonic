import { expect, test } from "@playwright/test";

/**
 * The sidebar's workspace switcher in a 1280px window, the sidebar at its starting 264px. A long
 * folder is cut in the middle and keeps at most its last 24 characters, so its end fits on the one
 * line next to the chevron. jsdom has no layout, so the boxes are read in a real Chromium and WebKit.
 */

test.use({ viewport: { width: 1280, height: 800 } });

for (const name of ["Workspace: Acme", "Workspace: Support"]) {
  test(`${name}: the folder's end stays on one line, inside the switcher`, async ({ page }) => {
    await page.goto("/workspace-switcher.html");
    const switcher = page.getByRole("button", { name, exact: true });
    await expect(switcher).toBeVisible();

    const line = switcher.locator(".text-caption").first();
    const start = line.locator("> span").first();
    const end = line.locator("> span").last();
    // The start stretches to the end's height, so one line is the end's own line height.
    const { endHeight, lineHeight } = await end.evaluate((element) => ({
      endHeight: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(endHeight).toBe(lineHeight);
    // The start keeps some of itself and its "…", and the end stops before the switcher's edge.
    const startWidth = await start.evaluate((element) => element.getBoundingClientRect().width);
    expect(startWidth).toBeGreaterThan(0);
    const past = await switcher.evaluate((button) => {
      const edge = button.getBoundingClientRect().right;
      return Math.max(
        ...[...button.querySelectorAll("*")].map(
          (part) => part.getBoundingClientRect().right - edge,
        ),
      );
    });
    expect(past).toBeLessThanOrEqual(0);
  });
}
