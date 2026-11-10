import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * kit.context-menu, opened by a real right-click in a real browser (HAL-4322). On Linux and macOS
 * the browser fires `contextmenu` on the press, before the release, and a popover's light dismiss
 * runs on the release. jsdom's popover fake has no light dismiss, so only here can a menu that
 * opens and closes again in the same click show up.
 */

/** The tab named `name`. */
function tab(page: Page, name: string): Locator {
  return page.getByRole("tab", { name, exact: true });
}

/** Presses and releases the right button on `locator`'s middle, as a hand does. */
async function rightClick(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The element is not shown, so it can't be right-clicked.");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
}

test("a right-click on a tab opens its menu, and it stays open after the release", async ({
  page,
}) => {
  await page.goto("/context-menu.html");
  await rightClick(page, tab(page, "Agents"));

  const menu = page.getByRole("menu", { name: "Agents" });
  await expect(menu).toBeVisible();
  // A light dismiss would come straight after the release; give it a moment to show.
  await page.waitForTimeout(200);
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();
  await expect(page.getByText("Closed by itself: 0")).toBeVisible();
});

test("a right-click on another tab moves the menu to it, and Escape gives that tab the focus", async ({
  page,
}) => {
  await page.goto("/context-menu.html");
  await rightClick(page, tab(page, "Agents"));
  await expect(page.getByRole("menu", { name: "Agents" })).toBeVisible();

  await rightClick(page, tab(page, "Support reply"));
  const menu = page.getByRole("menu", { name: "Support reply" });
  await page.waitForTimeout(200);
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(tab(page, "Support reply")).toBeFocused();
});
