import { expect, type Locator, test } from "@playwright/test";

/**
 * The box in its window (HAL-19213): the quick ask window is 560 px high and the box keeps a 32 px
 * margin, so the box has 496 px. A long answer and a reply must scroll the exchanges, and keep the
 * question row and the footer's Copy and Open in Messenger inside the box.
 */
test.use({ viewport: { width: 704, height: 560 } });

/** The element's box on the page, which every visible element here has. */
async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the element isn't laid out");
  return box;
}

/** Fails unless `inner` lies wholly inside `outer`, give or take half a pixel of rounding. */
async function expectInside(inner: Locator, outer: Locator) {
  const [child, parent] = [await bounds(inner), await bounds(outer)];
  expect(child.y).toBeGreaterThanOrEqual(parent.y - 0.5);
  expect(child.y + child.height).toBeLessThanOrEqual(parent.y + parent.height + 0.5);
}

test("a long answer and a reply scroll the exchanges and keep the footer in the box", async ({
  page,
}) => {
  await page.goto("/box.html");
  const box = page.getByRole("dialog", { name: "Ask an agent" });
  const text = box.getByRole("textbox");

  await text.fill("Where are we with the release?");
  await text.press("Enter");
  await expect(box.getByRole("button", { name: "Copy" })).toBeVisible();
  await text.fill("And the notes?");
  await text.press("Enter");
  await expect(box.locator("[data-answer]")).toHaveCount(2);

  const height = (await bounds(box)).height;
  expect(height).toBeLessThanOrEqual(496.5);
  expect(height).toBeGreaterThan(400);
  await expectInside(text, box);
  await expectInside(box.getByRole("button", { name: "Copy" }), box);
  await expectInside(box.getByRole("button", { name: "Open in Messenger" }), box);

  // The exchanges scroll, and show the newest one: the list is at its end.
  const list = box.locator("ol");
  const scroll = await list.evaluate((element) => ({
    overflows: element.scrollHeight > element.clientHeight,
    fromEnd: element.scrollHeight - element.clientHeight - element.scrollTop,
  }));
  expect(scroll.overflows).toBe(true);
  expect(scroll.fromEnd).toBeLessThanOrEqual(1);
});
