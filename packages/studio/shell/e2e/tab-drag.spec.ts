import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * shell.window-tab-strip, the drag example (UX checklist 1.2), with a real pointer in a real
 * browser. The jsdom tests in src/tabs lay the tabs out by hand; here the kit's CSS does it.
 */

/** The tabs' names, left to right. */
function tabNames(page: Page): Promise<string[]> {
  return page
    .getByRole("tab")
    .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("aria-label") ?? ""));
}

/** The tab named `name`, by its exact accessible name. */
function tab(page: Page, name: string): Locator {
  return page.getByRole("tab", { name, exact: true });
}

/** Where `locator` is on the page. It must be shown. */
async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The element is not shown, so it has no box to drag from.");
  }
  return box;
}

test("dragging Agents past Sorter's middle moves it after Sorter, and the release ends the drag", async ({
  page,
}) => {
  await page.goto("/tab-strip.html");
  await expect
    .poll(() => tabNames(page))
    .toEqual(["Agents", "Sorter, agent", "Support reply, workflow"]);

  const agents = await boxOf(tab(page, "Agents"));
  const sorter = await boxOf(tab(page, "Sorter, agent"));
  const reply = await boxOf(tab(page, "Support reply, workflow"));
  const y = agents.y + agents.height / 2;

  // Pressed on Agents' middle, then let go 10px past Sorter's middle, in small steps like a hand.
  await page.mouse.move(agents.x + agents.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(sorter.x + sorter.width / 2 + 10, y, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => tabNames(page))
    .toEqual(["Sorter, agent", "Agents", "Support reply, workflow"]);

  // After the release, moving the pointer past Support reply moves nothing.
  await page.mouse.move(reply.x + reply.width - 4, y, { steps: 6 });
  expect(await tabNames(page)).toEqual(["Sorter, agent", "Agents", "Support reply, workflow"]);
});
