import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * On a phone, a toast that would cover the focused button sits at the top, under the top bar
 * (`kit.toast-clear-of-focus`, UX check C289, TO1). Whether it covers depends on real layout,
 * which jsdom doesn't have, so the boxes are measured in a real Chromium and WebKit.
 */

/** 400 % zoom of a 780 × 1684 window, where C289 found the toast over the button. */
const zoomed = { width: 195, height: 421 };
/** The smallest phone the Studio is checked at, where the toast was already clear. */
const smallPhone = { width: 320, height: 568 };

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (found === null) {
    throw new Error("The element isn't drawn.");
  }
  return found;
}

/** The area two boxes share, in square px; 0 when they only touch or are apart. */
function overlap(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(width, 0) * Math.max(height, 0);
}

/** Presses Go back to this version from the keyboard, so focus stays on it in every browser. */
async function goBack(page: Page): Promise<{ button: Box; toast: Box }> {
  await page.goto("/toast-placement.html");
  const button = page.getByRole("button", { name: "Go back to this version" });
  await button.focus();
  await page.keyboard.press("Enter");
  const toast = page.getByRole("region", { name: "Notifications" }).getByRole("status");
  await expect(toast).toBeVisible();
  await expect(button).toBeFocused();
  return { button: await box(button), toast: await box(toast) };
}

test("at 195px the toast sits under the top bar, clear of the button that made it", async ({
  page,
}) => {
  await page.setViewportSize(zoomed);
  const { button, toast } = await goBack(page);
  const topBar = await box(page.getByText("History", { exact: true }));
  expect(overlap(toast, button)).toBe(0);
  expect(toast.y).toBeCloseTo(topBar.y + topBar.height + 8, 0);
});

test("at 320px the toast stays at the bottom, already clear of the button", async ({ page }) => {
  await page.setViewportSize(smallPhone);
  const { button, toast } = await goBack(page);
  expect(overlap(toast, button)).toBe(0);
  expect(toast.y + toast.height).toBeCloseTo(smallPhone.height - 8, 0);
});
