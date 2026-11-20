import { expect, test } from "@playwright/test";

/**
 * The phone's bottom navigation (`shell.phone-bars`) in a window 195px wide and 421px high, what
 * 400 % zoom leaves of a 780px one. Its four items get 49px each, less than the 56px halo pill, so
 * the pill takes its item's width and nothing reaches past the window: neither the page nor the
 * phone's column, which scrolls in a short window (`short:`), can be nudged sideways (HAL-13895).
 * jsdom has no layout, so the widths are read in a real Chromium and WebKit.
 */

test.use({ viewport: { width: 195, height: 421 } });

for (const place of ["home", "inbox", "runs", "more"]) {
  test(`nothing scrolls sideways at 195px with the user in ${place}`, async ({ page }) => {
    await page.goto(`/bottom-navigation.html?place=${place}`);
    const navigation = page.getByRole("navigation", { name: "Places" });
    await expect(navigation.locator('[aria-current="page"]')).toBeVisible();

    const widths = await page.evaluate(() => {
      const column = document.querySelector("main")?.parentElement?.parentElement;
      return {
        window: window.innerWidth,
        page: document.documentElement.scrollWidth,
        column: column?.scrollWidth,
        columnBox: column?.clientWidth,
      };
    });
    expect(widths.page).toBe(widths.window);
    expect(widths.column).toBe(widths.columnBox);
    expect(widths.column).toBe(widths.window);
  });
}
