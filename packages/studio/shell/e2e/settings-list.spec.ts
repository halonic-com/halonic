import { expect, test } from "@playwright/test";

/**
 * The phone's Settings list keeps its scroll through Back (HAL-7860). jsdom has no layout and does
 * not scroll a focused element into view, so a real Chromium and WebKit check that moving focus to
 * the page's heading on Back leaves the list where it was.
 */
test("Back puts the list at the scroll it had, not at the top", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/settings-list.html");
  const main = page.locator("main");
  await main.evaluate((element) => {
    element.scrollTop = 600;
  });
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(300);
  const before = await main.evaluate((element) => element.scrollTop);
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "A section" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeFocused();
  expect(await main.evaluate((element) => element.scrollTop)).toBe(before);
});
