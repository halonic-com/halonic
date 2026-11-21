import { expect, type Locator, test } from "@playwright/test";

/**
 * Recent rows on the Welcome screen (`shell.welcome-recent`) in a 320px wide window, the width
 * 400% zoom leaves of a 1280px one (WCAG 1.4.10 Reflow). A folder whose last name is wider than
 * its row wraps inside the row, and a long name shows in full. jsdom has no layout, so the boxes
 * are read in a real Chromium and WebKit.
 */

test.use({ viewport: { width: 320, height: 800 } });

/**
 * How far, in px, any part of `row` or its text reaches past the row's left or right edge; 0 when
 * none does. Text a part clips itself, as the folder's start cut with "…" does, draws nothing past it.
 * A part with no box, such as the `<wbr>` between folder names, draws nothing and is skipped: its
 * box would read as the window's corner.
 */
async function overflow(row: Locator): Promise<number> {
  return row.evaluate((button) => {
    const edges = button.getBoundingClientRect();
    let furthest = 0;
    for (const part of button.querySelectorAll("*")) {
      if (part.getClientRects().length === 0) {
        continue;
      }
      const box = part.getBoundingClientRect();
      furthest = Math.max(furthest, box.right - edges.right, edges.left - box.left);
      if (getComputedStyle(part).overflowX === "visible") {
        furthest = Math.max(furthest, part.scrollWidth - part.clientWidth);
      }
    }
    return furthest;
  });
}

/** The folder's line in `row`: its start, cut with "…", and its kept end. */
function folderParts(row: Locator): { line: Locator; start: Locator; end: Locator } {
  const line = row.locator(".text-caption").first();
  return { line, start: line.locator("> span").first(), end: line.locator("> span").last() };
}

/**
 * The height, in px, of one line of `text`. Read from its style, not a box: the folder's start
 * stretches to the height of its end, so its box is as tall as all the end's lines.
 */
async function lineHeightOf(text: Locator): Promise<number> {
  return Number.parseFloat(await text.evaluate((element) => getComputedStyle(element).lineHeight));
}

/** The height, in px, of `element`'s box. */
async function heightOf(element: Locator): Promise<number> {
  return element.evaluate((part) => part.getBoundingClientRect().height);
}

const rows = [
  {
    kind: "POSIX",
    name: "Benelux support, /work/projects/customer-support-automation-for-the-benelux-region",
  },
  {
    kind: "Windows",
    name: "Benelux support on Windows, D:\\Work\\Customer support automation for the Benelux region", // leak-guard: allow absolute-path made-up Windows path for the test
  },
];

for (const { kind, name } of rows) {
  test(`a ${kind} folder whose last name is wider than its row wraps and stays inside the row`, async ({
    page,
  }) => {
    await page.goto("/welcome-recent.html");
    const row = page.getByRole("button", { name, exact: true });
    await expect(row).toBeVisible();

    expect(await overflow(row)).toBeLessThanOrEqual(0);
    const { line, start, end } = folderParts(row);
    expect(await heightOf(end)).toBeGreaterThan((await lineHeightOf(line)) * 1.5);
    // The start keeps 2em, its first letter and a whole "…", so the end doesn't read as a folder
    // of its own and the start never reads as the parent folder `..`.
    const { startWidth, fontSize } = await start.evaluate((element) => ({
      startWidth: element.getBoundingClientRect().width,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    }));
    expect(startWidth).toBeGreaterThanOrEqual(fontSize * 2 - 0.5);
  });
}

test("a short folder stays on one line, whole", async ({ page }) => {
  await page.goto("/welcome-recent.html");
  const row = page.getByRole("button", { name: "Acme, ~/Work/acme", exact: true });
  const { line, end } = folderParts(row);
  expect(await heightOf(end)).toBe(await lineHeightOf(line));
  expect(await overflow(row)).toBeLessThanOrEqual(0);
});

test("a name too long for one line wraps and shows in full", async ({ page }) => {
  await page.goto("/welcome-recent.html");
  const fullName = "Customer support automation for the Benelux region and the rest of Europe";
  const row = page.getByRole("button", { name: `${fullName}, ~/Documents/Acme Support` });
  const nameLine = row.getByText(fullName, { exact: true });
  await expect(nameLine).toBeVisible();

  const { height, clipped } = await nameLine.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    clipped:
      element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
  }));
  expect(clipped).toBe(false);
  expect(height).toBeGreaterThan((await lineHeightOf(nameLine)) * 1.5);
  expect(await overflow(row)).toBeLessThanOrEqual(0);
});
