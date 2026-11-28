import { expect, type Page, test } from "@playwright/test";

/**
 * `shell.frame`: the active window tab's outline runs unbroken down both sides into the framed
 * panel's top line, in light and dark, for the first tab and for one that isn't first (the
 * approved mockup, v26 on HAL-20617; HAL-21213). The pixels are read from a capture of the real
 * Studio window, since jsdom draws nothing. Playwright has no `verifies()`; the jsdom test in
 * `src/frame/frame-tabs.test.tsx` names the requirement.
 */
const window1440 = { width: 1440, height: 900 };
/** The active tab's top corners: `rounded-t-sm`, 8px. The side lines are straight under them. */
const topCurve = 8;

/** A CSS pixel of the window, `x` across and `y` down. */
type Point = readonly [x: number, y: number];

/**
 * The colours, as "r,g,b", of `points` in a capture of the window, decoded by the page's own
 * canvas. Each is read at its CSS pixel's top start device pixel (WebKit's Desktop Safari draws at
 * 2), not scaled down, which would blend a line with its neighbours.
 */
async function coloursAt(page: Page, points: readonly Point[]): Promise<string[]> {
  const png = await page.screenshot();
  return page.evaluate(
    async ({ base64, cssWidth, wanted }) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("The page has no 2D canvas.");
      context.drawImage(bitmap, 0, 0);
      const scale = bitmap.width / cssWidth;
      return wanted.map(([x, y]) =>
        [...context.getImageData(x * scale, y * scale, 1, 1).data.slice(0, 3)].join(","),
      );
    },
    { base64: png.toString("base64"), cssWidth: window1440.width, wanted: points },
  );
}

async function showTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((chosen) => {
    document.documentElement.setAttribute("data-theme", chosen);
    // Reading a style starts the colours' easing; finishing it shows the theme's colours at once.
    getComputedStyle(document.documentElement).color;
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
  }, theme);
}

/** Opens the window with two tabs and makes the one at `index` active, the pointer off the tabs. */
async function windowWithActiveTab(page: Page, index: number) {
  await page.setViewportSize(window1440);
  await page.goto("/rail-frame.html");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await page.getByRole("button", { name: "New tab" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("tab").nth(index).click();
  await expect(page.getByRole("tab").nth(index)).toHaveAttribute("aria-selected", "true");
  await page.mouse.move(window1440.width / 2, window1440.height / 2);
}

/**
 * Each side line's pixel column, from under the tab's top curve down to the panel's top line,
 * against the panel's top line far from the tab: the same line colour, no other.
 */
async function sideLines(page: Page) {
  const tab = await page.getByRole("tab", { selected: true }).boundingBox();
  const panel = await page.locator("[data-framed-panel]").boundingBox();
  if (tab === null || panel === null) throw new Error("The active tab or the panel isn't drawn.");
  const panelTop = Math.round(panel.y);
  const columns = [Math.round(tab.x), Math.round(tab.x + tab.width) - 1];
  const rows = { from: Math.round(tab.y) + topCurve, to: panelTop };
  const ys = Array.from({ length: rows.to - rows.from + 1 }, (_, offset) => rows.from + offset);
  const [line = "", surface = "", ...column] = await coloursAt(page, [
    // The panel's top line far from the tab, and under the tab's middle, where it's hidden.
    [Math.round(panel.x + panel.width) - 40, panelTop],
    [Math.round(tab.x + tab.width / 2), panelTop],
    ...columns.flatMap((x) => ys.map((y): Point => [x, y])),
  ]);
  const drawn = columns.map((x, index) => ({
    x,
    off: ys.filter((_, row) => column[index * ys.length + row] !== line),
  }));
  return { line, surface, rows, drawn };
}

for (const theme of ["light", "dark"] as const) {
  for (const [index, which] of ["first", "second"].entries()) {
    test(`at 1440px in ${theme}, the ${which} tab's side lines run into the panel's top line`, async ({
      page,
    }) => {
      await windowWithActiveTab(page, index);
      await showTheme(page, theme);
      const { line, surface, rows, drawn } = await sideLines(page);
      // The measured columns, for the pull request's body.
      console.log(
        `${theme} ${which}: x ${drawn.map((column) => column.x).join(" and ")}, y ${rows.from}–${rows.to} in ${line}`,
      );
      // Under the tab, between its side lines, the panel's top line is hidden.
      expect(surface).not.toBe(line);
      expect(drawn).toEqual(drawn.map((column) => ({ x: column.x, off: [] })));
    });
  }
}
