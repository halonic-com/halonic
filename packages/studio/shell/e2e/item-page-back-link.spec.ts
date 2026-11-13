import { expect, type Page, test } from "@playwright/test";

/**
 * The back link above a page's title (`shell.page-back-link`) sits inside the item page, so a chat
 * page that is as tall as its tab still fits it. jsdom has no layout, so the heights are read in a
 * real Chromium and WebKit.
 */

/** The tab page's scroll height and visible height, in px. */
async function heights(page: Page): Promise<{ scrollHeight: number; clientHeight: number }> {
  return page.locator("[data-tab-page]").evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
}

test("a chat page with the link doesn't scroll, and its composer stays in view", async ({
  page,
}) => {
  await page.goto("/item-page-back-link.html");
  await expect(page.getByRole("navigation", { name: "Back" })).toBeVisible();

  const { scrollHeight, clientHeight } = await heights(page);
  expect(scrollHeight).toBe(clientHeight);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeInViewport();
});

test("the link comes before the header", async ({ page }) => {
  await page.goto("/item-page-back-link.html?chat=none");
  const link = await page.getByRole("navigation", { name: "Back" }).boundingBox();
  const header = await page.locator("header").boundingBox();
  expect(link === null || header === null ? undefined : link.y + link.height).toBeLessThanOrEqual(
    header?.y ?? 0,
  );
});
