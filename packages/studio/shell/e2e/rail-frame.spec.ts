import { expect, type Locator, test } from "@playwright/test";

/**
 * The rail is the window's first 64px, its 40px buttons 12px in and 4px apart, the first level
 * with the framed panel's top and Settings 10px above the window's bottom edge; the title bar's
 * mark sits on the rail's axis (the approved mockup, v26 on HAL-20617; HAL-20946). jsdom has no
 * layout, so a real browser measures the boxes.
 */
const window1280 = { width: 1280, height: 800 };

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

test("at 1280px the rail is the window's first 64px, its buttons 12px in and 4px apart", async ({
  page,
}) => {
  await page.setViewportSize(window1280);
  await page.goto("/rail-frame.html");
  const rail = page.locator("[data-icon-rail]");
  await expect(rail.getByRole("button", { name: "Inbox" })).toBeVisible();

  const railBox = await box(rail);
  expect(railBox.x).toBe(0);
  expect(railBox.width).toBe(64);

  const names = ["Home", "Library", "Inbox"];
  const buttons = await Promise.all(
    names.map((name) => box(rail.getByRole("button", { name, exact: true }))),
  );
  for (const button of buttons) {
    expect(button.x).toBe(12);
    expect(button.width).toBe(40);
  }
  for (const [index, button] of buttons.slice(1).entries()) {
    expect(button.y - (buttons[index]?.y ?? Number.NaN)).toBe(44);
  }
  const panel = await box(page.locator("[data-framed-panel]"));
  expect(buttons[0]?.y).toBe(panel.y);

  // Settings, the rail's last button, ends where the rail's padding starts: 10px above the edge.
  const paddingBottom = await rail.evaluate((nav) => getComputedStyle(nav).paddingBottom);
  const railBottom = railBox.y + railBox.height - Number.parseFloat(paddingBottom);
  expect(railBottom).toBe(window1280.height - 10);
});

test("at 1280px the title bar's mark sits on the rail's axis", async ({ page }) => {
  await page.setViewportSize(window1280);
  await page.goto("/rail-frame.html");
  const mark = await box(page.locator("[data-brand-mark] svg").first());
  expect(mark.x + mark.width / 2).toBe(32);
});
