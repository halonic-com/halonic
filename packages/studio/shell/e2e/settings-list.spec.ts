import { expect, type Page, test } from "@playwright/test";

/**
 * The phone's Settings list keeps its scroll through Back (HAL-7860). jsdom has no layout and does
 * not scroll a focused element into view, so a real Chromium and WebKit check that moving focus to
 * the page's heading on Back leaves the list where it was.
 *
 * On a phone `main` scrolls. In a short window (`short:`, at most 36em high) `main` grows with the
 * list and the whole column scrolls instead, bars included (HAL-12665), so the list keeps the
 * column's scroll there (HAL-12768).
 */
const layouts = [
  { name: "a phone", width: 360, height: 640, scroller: (page: Page) => page.locator("main") },
  {
    name: "a short window",
    width: 320,
    height: 256,
    scroller: (page: Page) => page.locator("main").locator(".."),
  },
];

for (const layout of layouts) {
  test(`Back puts the list at the scroll it had, not at the top, in ${layout.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto("/settings-list.html");
    const scroller = layout.scroller(page);
    // The list keeps its scroll from the `scroll` event, which comes a frame later. A user's scroll
    // has sent it long before they tap a row, so wait for it here too.
    await scroller.evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          element.addEventListener("scroll", () => resolve(), { once: true });
          element.scrollTop = 600;
        }),
    );
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(300);
    const before = await scroller.evaluate((element) => element.scrollTop);
    // In a short window the bar with "Open" has scrolled away with the column, and a real click
    // would scroll it back first. A row tap opens a section in the window, with no scroll.
    await page.getByRole("button", { name: "Open" }).dispatchEvent("click");
    await expect(page.getByRole("heading", { name: "A section" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeFocused();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(before);
  });
}
