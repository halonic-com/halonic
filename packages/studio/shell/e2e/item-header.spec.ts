import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * The item header's name field (HAL-1290, HAL-4670): it is as wide as its text, the ⋮ sits right
 * after it, and a long name is cut with an ellipsis before the views nav. jsdom has no layout, so
 * the widths are read in a real Chromium and WebKit (Tauri draws with WebKit on macOS and Linux).
 */

/** A name much longer than the room the header leaves for it. */
const longName = "A very long workflow name that goes on and on ".repeat(8).trim();

/** The name field. */
function nameField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Workflow name" });
}

/** Where `locator` is on the page. It must be shown. */
async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The element is not shown, so it has no box to measure.");
  }
  return box;
}

/** The field's width, in px. */
async function fieldWidth(page: Page): Promise<number> {
  return (await boxOf(nameField(page))).width;
}

test("a short name leaves 4px between the field and the ⋮", async ({ page }) => {
  await page.goto("/item-header.html?name=Run");
  const field = await boxOf(nameField(page));
  const more = await boxOf(page.getByRole("button", { name: "More actions for Run" }));
  expect(more.x - (field.x + field.width)).toBeCloseTo(4, 0);
});

test("a long name ends before the views nav and is cut with an ellipsis", async ({ page }) => {
  await page.goto(`/item-header.html?name=${encodeURIComponent(longName)}`);
  const field = await boxOf(nameField(page));
  const views = await boxOf(page.getByRole("tablist", { name: "Workflow views" }));
  expect(field.x + field.width).toBeLessThanOrEqual(views.x);
  await expect(nameField(page)).toHaveCSS("text-overflow", "ellipsis");
});

test("typing grows the field, clearing it shrinks it, and an empty field is still wider than 10px", async ({
  page,
}) => {
  await page.goto("/item-header.html?name=Run");
  const field = nameField(page);
  const short = await fieldWidth(page);

  await field.fill("Support reply for new customers");
  const typed = await fieldWidth(page);
  expect(typed).toBeGreaterThan(short);

  await field.fill("");
  const empty = await fieldWidth(page);
  expect(empty).toBeLessThan(typed);
  expect(empty).toBeGreaterThan(10);
});
