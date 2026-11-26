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

test("the question stays pinned over a long answer, and the answer's first line shows whole at the top", async ({
  page,
}) => {
  await page.goto("/box.html");
  const box = page.getByRole("dialog", { name: "Ask an agent" });
  const text = box.getByRole("textbox");
  const question = "Where are we with the release?";

  await text.fill(question);
  await text.press("Enter");
  await expect(box.getByRole("button", { name: "Copy" })).toBeVisible();

  // The newest answer is in view, so its question has scrolled above the divider and is pinned.
  const list = box.locator("ol");
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const pinned = box.locator("[data-pinned-question]");
  await expect(pinned).toHaveText(question);
  await expectInside(pinned, box);
  expect((await bounds(pinned)).y).toBeGreaterThanOrEqual((await bounds(list)).y - 0.5);
  await page.screenshot({
    path: "test-results/screenshots/quick-ask-long-answer-end.png",
    animations: "disabled",
  });

  // At the top, the question is back in the list and the first line sits below the fade.
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(pinned).toHaveCount(0);
  const firstLine = box.locator("[data-answer] p").first();
  const fade = box.locator("[data-fade]");
  const fadeBottom = (await bounds(fade)).y + (await bounds(fade)).height;
  expect((await bounds(firstLine)).y).toBeGreaterThanOrEqual(fadeBottom - 0.5);
  await expectInside(firstLine, list);
  await page.screenshot({
    path: "test-results/screenshots/quick-ask-long-answer-top.png",
    animations: "disabled",
  });
});
