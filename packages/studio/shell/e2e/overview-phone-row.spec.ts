import { expect, type Page, test } from "@playwright/test";

/**
 * A phone row's line under the name, "detail · used-by" (shell.overview.used-by, HAL-13066,
 * HAL-13648). The detail is cut first; when even a cut detail leaves no room, the used-by text has
 * the line alone and the detail and its " · " aren't shown. jsdom has no layout, so the boxes are
 * read in a real Chromium and WebKit. 195px is a 390px phone at 200 % zoom.
 */

/** A box on the page, from `getBoundingClientRect`. */
interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The boxes of a row's line under the name and of its parts. */
interface LineBoxes {
  /** The part of the line that clips: what is outside it isn't shown. */
  readonly line: Box;
  readonly detail: Box;
  /**
   * The detail is drawn where its box says: it has a height, and the point in its middle hits it.
   * A 0px high box still lies inside the line, so its box alone can't tell (HAL-14630).
   */
  readonly detailPainted: boolean;
  readonly dot: Box;
  readonly usedBy: Box;
  /** The used-by text is wider than its box, so part of it is cut off. */
  readonly usedByCut: boolean;
}

/** Reads the boxes of the line under `name`'s row. */
async function lineUnder(
  page: Page,
  name: string,
  detail: string,
  usedBy: string,
): Promise<LineBoxes> {
  return page.evaluate(
    ({ name, detail, usedBy }) => {
      const row = [...document.querySelectorAll("tr")].find((each) =>
        each.textContent?.includes(name),
      );
      const spans = [...(row?.querySelectorAll(".text-small span") ?? [])];
      const find = (text: string) => {
        const span = spans.find((each) => each.textContent === text);
        if (span === undefined) {
          throw new Error(`The row of ${name} has no "${text}" under its name.`);
        }
        return span;
      };
      const boxOf = (element: Element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      };
      const usedBySpan = find(usedBy);
      const detailSpan = find(detail);
      const detailBox = detailSpan.getBoundingClientRect();
      const detailHit = document.elementFromPoint(
        detailBox.left + 1,
        (detailBox.top + detailBox.bottom) / 2,
      );
      const line = row?.querySelector(".text-small > span");
      if (line === null || line === undefined) {
        throw new Error(`The row of ${name} has no line under its name.`);
      }
      return {
        line: boxOf(line),
        detail: boxOf(detailSpan),
        detailPainted: detailBox.height > 0 && detailHit === detailSpan,
        dot: boxOf(find(" · ")),
        usedBy: boxOf(usedBySpan),
        usedByCut: usedBySpan.scrollWidth > usedBySpan.clientWidth,
      };
    },
    { name, detail, usedBy },
  );
}

/** Whether `inner` lies inside `outer`, to within half a pixel. */
function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.bottom <= outer.bottom + 0.5
  );
}

test("at 390px the line reads the cut detail, the dot and the whole used-by text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/overview-phone-row.html");
  const boxes = await lineUnder(
    page,
    "Refund handling",
    "When an email asks for a refund",
    "Not used yet",
  );
  expect(inside(boxes.dot, boxes.line)).toBe(true);
  expect(inside(boxes.usedBy, boxes.line)).toBe(true);
  expect(boxes.usedByCut).toBe(false);
  expect(boxes.detailPainted).toBe(true);
  expect(boxes.detail.right).toBeLessThanOrEqual(boxes.dot.left + 0.5);
  expect(boxes.dot.top).toBeCloseTo(boxes.usedBy.top, 0);
  // The cut detail shows: its box is a line high and on the line, not clipped to nothing.
  expect(boxes.detail.bottom - boxes.detail.top).toBeGreaterThan(0);
  expect(boxes.detail.right - boxes.detail.left).toBeGreaterThan(0);
  expect(inside(boxes.detail, boxes.line)).toBe(true);
  expect(boxes.detail.top).toBeCloseTo(boxes.usedBy.top, 0);
  await expect(page.getByText("When an email asks for a refund", { exact: true })).toBeVisible();
});

test("at 390px a short detail reads straight on into the dot and the used-by text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/overview-phone-row.html");
  const boxes = await lineUnder(page, "Tone of voice", "Friendly", "Used by Writer");
  expect(boxes.detailPainted).toBe(true);
  // No gap: "Friendly · Used by Writer", not "Friendly ·" and the used-by text far to the right.
  expect(boxes.dot.left).toBeCloseTo(boxes.detail.right, 0);
  expect(boxes.usedBy.left).toBeCloseTo(boxes.dot.right, 0);
});

test("at 390px a short detail's dot is right before the used-by text, with no gap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/overview-phone-row.html");
  const boxes = await lineUnder(page, "Shop name", "Adds the shop's name", "Used by Sales");
  expect(boxes.usedBy.left - boxes.dot.right).toBeCloseTo(0, 0);
  expect(boxes.dot.top).toBeCloseTo(boxes.usedBy.top, 0);
});

test("at 195px the used-by text has the line alone and whole, with no stray dot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 195, height: 640 });
  await page.goto("/overview-phone-row.html");
  const boxes = await lineUnder(
    page,
    "Refund handling",
    "When an email asks for a refund",
    "Not used yet",
  );
  expect(inside(boxes.usedBy, boxes.line)).toBe(true);
  expect(boxes.usedByCut).toBe(false);
  expect(boxes.usedBy.left).toBeCloseTo(boxes.line.left, 0);
  // Below the clipping line, so neither shows: no line starts with " · ".
  expect(boxes.dot.top).toBeGreaterThanOrEqual(boxes.line.bottom - 0.5);
  expect(boxes.detail.top).toBeGreaterThanOrEqual(boxes.line.bottom - 0.5);
  await expect(page.getByText("Not used yet", { exact: true })).toBeVisible();
});

test("at 390px a detail narrower than 5rem leaves no gap before the used-by text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/overview-phone-row.html");
  const boxes = await lineUnder(page, "Welcome email", "Draft", "Used by Writer");
  expect(boxes.usedBy.left - boxes.dot.right).toBeCloseTo(0, 0);
  expect(boxes.dot.top).toBeCloseTo(boxes.usedBy.top, 0);
});
