import { expect, type Page, test } from "@playwright/test";

/**
 * A "New …" sheet's Name and Hub row on a phone (HAL-14648). At 195px, a 780px window at 400 %
 * (WCAG 1.4.10), the row once kept its inputs' own width, 231px, so the sheet scrolled sideways
 * and tabbing to a field cut its label to "ame", "ub" or "ompt". jsdom has no layout, so the boxes
 * are read in a real Chromium and WebKit, after focusing each field as a keyboard user would.
 */

/** A box on the page, from `getBoundingClientRect`. */
interface Box {
  readonly left: number;
  readonly right: number;
}

/** What one field looks like once it has focus. */
interface FocusedField {
  readonly sheet: Box;
  readonly label: Box;
  readonly control: Box;
  /** Elements in the sheet that scroll sideways, or have been scrolled sideways. */
  readonly scrolledSideways: readonly string[];
}

/** Focuses the field labelled `label` and reads its boxes and the sheet's sideways scroll. */
async function focusField(page: Page, label: string): Promise<FocusedField> {
  await page.getByLabel(label, { exact: true }).focus();
  return page.evaluate((label) => {
    const sheet = document.querySelector("dialog[open]");
    const labelElement = [...document.querySelectorAll("label")].find(
      (each) => each.textContent?.trim() === label,
    );
    const control = labelElement && document.getElementById(labelElement.htmlFor);
    if (sheet === null || labelElement === undefined || control === null || control === undefined) {
      throw new Error(`The sheet has no field labelled "${label}".`);
    }
    const boxOf = (element: Element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    };
    const scrolledSideways = [sheet, ...sheet.querySelectorAll("*")]
      .filter((each) => each.scrollLeft > 0 || each.scrollWidth > each.clientWidth + 0.5)
      .filter((each) => getComputedStyle(each).overflowX !== "visible" || each.scrollLeft > 0)
      .map((each) => `${each.tagName.toLowerCase()}.${[...each.classList].join(".")}`);
    return {
      sheet: boxOf(sheet),
      label: boxOf(labelElement),
      control: boxOf(control),
      scrolledSideways,
    };
  }, label);
}

/** Whether `inner` lies across `outer`, to within half a pixel. */
function inside(inner: Box, outer: Box): boolean {
  return inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
}

for (const { page: path, fields } of [
  { page: "/new-item-row.html", fields: ["Name", "Hub", "Prompt"] },
  { page: "/new-item-row.html?one-hub", fields: ["Name", "Prompt"] },
]) {
  test(`at 195px ${fields.join(", ")} fit the sheet, which doesn't scroll sideways (${path})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 195, height: 640 });
    await page.goto(path);
    for (const field of fields) {
      const focused = await focusField(page, field);
      expect(focused.scrolledSideways, field).toEqual([]);
      expect(inside(focused.label, focused.sheet), `${field}'s label`).toBe(true);
      expect(inside(focused.control, focused.sheet), `${field}'s box`).toBe(true);
    }
  });
}

test("at 390px the Hub picker is still under the name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/new-item-row.html");
  const name = await page.getByLabel("Name", { exact: true }).boundingBox();
  const hub = await page.getByLabel("Hub", { exact: true }).boundingBox();
  expect(hub?.y).toBeGreaterThan((name?.y ?? 0) + (name?.height ?? 0));
  expect(hub?.x).toBeCloseTo(name?.x ?? 0, 0);
});
