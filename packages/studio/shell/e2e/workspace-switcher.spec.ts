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

test.describe("at 200% zoom, a 640px window", () => {
  test.use({ viewport: { width: 640, height: 400 } });

  test("the menu of a 101-character folder stays inside the window, its key and check shown", async ({
    page,
  }) => {
    await page.goto("/workspace-switcher.html");
    await page.getByRole("button", { name: "Workspace: Renewals", exact: true }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const box = await menu.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.right).toBeLessThanOrEqual(640 - 8);
    const item = menu.getByRole("menuitemradio", { name: "Renewals" });
    for (const part of [item.locator("kbd").first(), item.locator("svg").last()]) {
      const right = await part.evaluate((element) => element.getBoundingClientRect().right);
      expect(right).toBeLessThanOrEqual(box.right);
    }
    // The folder is cut in the middle, as in the switcher: its end stays.
    const end = item.locator(".text-caption > span").last();
    await expect(end).toHaveText("/Q3 Renewals and Escalations");
  });
});
