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

/**
 * A window both narrow and short, 640 × 800 at 200 % (C606): the column grows down and scrolls as a
 * whole there, but it must never grow sideways. A page column that took its widest line's width
 * pushed `main` to 949px and the page's buttons off the window.
 */
test("main is as wide as a short phone window, 320 × 400", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto("/bottom-navigation.html");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  const widths = await page.evaluate(() => ({
    window: window.innerWidth,
    page: document.documentElement.scrollWidth,
    main: document.querySelector("main")?.getBoundingClientRect().width,
  }));
  expect(widths.main).toBe(widths.window);
  expect(widths.page).toBe(widths.window);
});
