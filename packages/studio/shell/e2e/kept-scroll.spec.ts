import { expect, type Page, test } from "@playwright/test";

/**
 * A phone page pushed above a scrolled list starts at its top, and Back puts the list back where
 * it was (HAL-12860). On a phone `main` scrolls. In a short window (`short:`, at most 36em high)
 * the whole column scrolls instead, bars included, so a pushed page that kept the list's offset
 * opened with the top bar and its Back off screen (C259). jsdom has no layout, so a real Chromium
 * and WebKit check it.
 */
const main = (page: Page) => page.locator("main");
const column = (page: Page) => page.locator("main").locator("..");
const layouts = [
  { name: "a phone", width: 360, height: 640, scroller: main },
  { name: "a short window", width: 320, height: 568, scroller: column },
  { name: "a very short window", width: 195, height: 421, scroller: column },
];

for (const layout of layouts) {
  test(`a pushed page starts at its top, and Back puts the list where it was, in ${layout.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto("/kept-scroll.html");
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
    // would scroll it back first. A row tap opens a page in the window, with no scroll.
    await page.getByRole("button", { name: "Open" }).dispatchEvent("click");
    await expect(page.getByRole("heading", { name: "A version" })).toBeVisible();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(page.getByRole("button", { name: "Back" })).toBeInViewport();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(before);
  });
}
