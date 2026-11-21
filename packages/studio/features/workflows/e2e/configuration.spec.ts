import { expect, type Locator, test } from "@playwright/test";

/**
 * A workflow's Configuration in a narrow window (HAL-12800): the page list sits above the page at
 * full width (N1), and the Tests page's command breaks only between its words (N2). 320 px is a
 * 1280 px window at 400 % zoom. In a wide window the list stays beside the page. Each narrow case
 * also leaves a screenshot in `test-results/screenshots/` for the reviewer, like screenshots.spec.ts.
 */
const configurationSizes = [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const;

const schemes = ["light", "dark"] as const;

/**
 * The pairs of letters or digits that a line break falls between, as in "Docum · ents". The
 * browser may still break after a hyphen ("-" · "-filter"), as it does in any text, so those don't
 * count. The kit's CommandBox puts each shell word in its own span, so the command spans several
 * text nodes and every character is measured where it is.
 */
function wordsSplitAcrossLines(code: Locator): Promise<string[]> {
  return code.evaluate((element) => {
    const characters: { text: string; line: number }[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node as Text;
      const range = document.createRange();
      for (let offset = 0; offset < text.data.length; offset++) {
        range.setStart(text, offset);
        range.setEnd(text, offset + 1);
        const line = Math.round(range.getBoundingClientRect().top);
        characters.push({ text: text.data.charAt(offset), line });
      }
    }
    const letterOrDigit = /[\p{L}\p{N}]/u;
    const split: string[] = [];
    characters.forEach((after, at) => {
      const before = characters[at - 1];
      if (before === undefined || before.line === after.line) return;
      if (letterOrDigit.test(before.text) && letterOrDigit.test(after.text)) {
        split.push(before.text + after.text);
      }
    });
    return split;
  });
}

for (const size of configurationSizes) {
  for (const scheme of schemes) {
    test(`N1, N2: configuration, tests, ${size.width}x${size.height}, ${scheme}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/configuration.html?page=tests");
      const list = page.getByRole("tablist", { name: "Configuration pages" });
      await expect(list.getByRole("tab", { name: "Tests" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // The kit's TabList sits in a padded column; the column is what spans the window.
      const listBox = await list.locator("..").boundingBox();
      const panelBox = await page.getByRole("tabpanel").boundingBox();
      expect(listBox !== null && panelBox !== null, "the list and the page are shown").toBe(true);
      if (listBox === null || panelBox === null) return;
      expect(listBox.y + listBox.height, "the list is above the page").toBeLessThanOrEqual(
        panelBox.y,
      );
      expect(listBox.width, "the list is as wide as the window").toBeCloseTo(size.width, 0);
      expect(panelBox.width, "the page is as wide as the window").toBeCloseTo(size.width, 0);
      const sideways = await page.evaluate(
        () =>
          [document.documentElement, ...document.querySelectorAll("[role=tabpanel]")].filter(
            (element) => element.scrollWidth > element.clientWidth,
          ).length,
      );
      expect(sideways, "nothing scrolls sideways").toBe(0);
      expect(
        await wordsSplitAcrossLines(page.locator("code")),
        "no word of the command is broken between these letters",
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/screenshots/configuration-tests-${size.width}-${scheme}.png`,
        fullPage: true,
      });
    });
  }
}

test("configuration keeps its page list beside the page in a wide window", async ({ page }) => {
  await page.goto("/configuration.html?page=general");
  const listBox = await page
    .getByRole("tablist", { name: "Configuration pages" })
    .locator("..")
    .boundingBox();
  const panelBox = await page.getByRole("tabpanel").boundingBox();
  expect(listBox !== null && panelBox !== null, "the list and the page are shown").toBe(true);
  if (listBox === null || panelBox === null) return;
  expect(listBox.x + listBox.width, "the list is left of the page").toBeLessThanOrEqual(panelBox.x);
  expect(listBox.y, "the list starts level with the page").toBeCloseTo(panelBox.y, 0);
});
