import { expect, type Page, test } from "@playwright/test";

/**
 * The kit's inline link on a phone (C606-3): a link inside a sentence keeps the sentence's line
 * height, so no gap opens round its line, and its tap area is still 48px high. A link on a line of
 * its own is a 48px row. jsdom has no layout, so the lines are read in a real Chromium and WebKit.
 * 390px is a phone; 320px is a 640px window at 200 % zoom.
 */

/** The tap area every link keeps on a phone, at least: --spacing-touch is 48px. */
const minimumTapHeight = 44;

/** The height of the sentence `name` in e2e/pages/inline-link.tsx. */
async function sentenceHeight(page: Page, name: string): Promise<number> {
  return page
    .locator(`[data-sentence="${name}"]`)
    .evaluate((element) => element.getBoundingClientRect().height);
}

/**
 * How far above and below its middle the link in sentence `name` still takes a tap: the points 1px
 * apart up and down from the middle of its words that hit the link or something inside it.
 */
async function tapHeight(page: Page, name: string): Promise<number> {
  return page.locator(`[data-sentence="${name}"] :is(a, button)`).evaluate((link) => {
    const words = link.getClientRects()[0];
    if (words === undefined) {
      throw new Error("The link has no box.");
    }
    const x = words.left + Math.min(words.width / 2, 8);
    const middle = (words.top + words.bottom) / 2;
    const hits = (y: number) => link.contains(document.elementFromPoint(x, y));
    let up = 0;
    while (hits(middle - up - 1)) up += 1;
    let down = 0;
    while (hits(middle + down + 1)) down += 1;
    return up + down + 1;
  });
}

for (const width of [390, 320]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/inline-link.html");
    });

    test("a sentence with a link is as tall as the same sentence without one", async ({ page }) => {
      expect(await sentenceHeight(page, "link")).toBeCloseTo(
        await sentenceHeight(page, "link-plain"),
        0,
      );
      expect(await sentenceHeight(page, "button")).toBeCloseTo(
        await sentenceHeight(page, "button-plain"),
        0,
      );
    });

    test("a link in a sentence still takes a tap 44px high or more", async ({ page }) => {
      expect(await tapHeight(page, "link")).toBeGreaterThanOrEqual(minimumTapHeight);
      expect(await tapHeight(page, "button")).toBeGreaterThanOrEqual(minimumTapHeight);
    });

    test("a link on a line of its own is a 48px row", async ({ page }) => {
      const heights = await page
        .locator("[data-list] button")
        .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
      expect(heights).toEqual([48, 48, 48]);
    });
  });
}
