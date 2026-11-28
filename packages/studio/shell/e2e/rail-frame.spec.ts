import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * The rail is the window's first 64px, its 40px buttons 12px in and 4px apart, the first level
 * with the framed panel's top and Settings 10px above the window's bottom edge; the title bar's
 * mark sits on the rail's axis with the words 8px after it, and in a narrow window the Places
 * button does (the approved mockup, v26 on HAL-20617; HAL-20946, look check HAL-20960). jsdom has
 * no layout, so a real browser measures the boxes.
 */
const wide = { width: 1280, height: 800 };
const narrow = { width: 640, height: 800 };
/** The rail's axis: the middle of its 64px. */
const railAxis = 32;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (found === null) {
    throw new Error("The element isn't drawn.");
  }
  return found;
}

async function openWindow(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/rail-frame.html");
  const rail = page.locator("[data-icon-rail]");
  await expect(rail.getByRole("button", { name: "Settings" })).toBeVisible();
  return rail;
}

test("at 1280px the rail is the window's first 64px, its buttons 12px in and 4px apart", async ({
  page,
}) => {
  const rail = await openWindow(page, wide);

  const railBox = await box(rail);
  expect(railBox.x).toBe(0);
  expect(railBox.width).toBe(64);

  const names = ["Home", "Library", "Inbox", "Settings"];
  const buttons = await Promise.all(
    names.map((name) => box(rail.getByRole("button", { name, exact: true }))),
  );
  for (const button of buttons) {
    expect(button.x).toBe(12);
    expect(button.width).toBe(40);
  }
  const apps = buttons.slice(0, -1);
  for (const [index, button] of apps.slice(1).entries()) {
    expect(button.y - (apps[index]?.y ?? Number.NaN)).toBe(44);
  }
  // The column of the tabs on the frame and the framed panel under them (HAL-21209).
  const column = await box(page.locator("[data-framed-column]"));
  expect(apps[0]?.y).toBe(column.y);
  const settings = buttons.at(-1);
  expect((settings?.y ?? 0) + (settings?.height ?? 0)).toBe(wide.height - 10);
});

test("at 1280px the title bar's mark sits on the rail's axis, the words 8px after it", async ({
  page,
}) => {
  await openWindow(page, wide);
  const brand = page.locator("[data-title-bar-brand]");
  const mark = await box(brand.locator("svg").first());
  expect(mark.x + mark.width / 2).toBe(railAxis);
  const words = await box(brand.getByText("Halonic Studio"));
  expect(words.x).toBe(mark.x + mark.width + 8);
});

test("at 1280px the active tab starts where the framed panel does", async ({ page }) => {
  await openWindow(page, wide);
  const panel = await box(page.locator("[data-framed-panel]"));
  const tab = await box(page.getByRole("tab", { selected: true }));
  expect(tab.x).toBe(panel.x);
});

test("at 1280px the tabs sit on the frame, so the active tab's fill differs from their ground", async ({
  page,
}) => {
  await openWindow(page, wide);
  const fill = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  const frame = await fill(page.locator("[data-layout]"));
  const activeTab = await fill(page.getByRole("tab", { selected: true }));
  expect(await fill(page.locator("[data-panel-tabs]"))).toBe("rgba(0, 0, 0, 0)");
  expect(activeTab).toBe(await fill(page.locator("[data-framed-panel]")));
  expect(activeTab).not.toBe(frame);
});

test("the framed panel's top stays put when the window narrows and the tabs fold", async ({
  page,
}) => {
  await openWindow(page, wide);
  const wideTop = (await box(page.locator("[data-framed-panel]"))).y;
  await page.setViewportSize(narrow);
  await expect(page.getByRole("tab")).toHaveCount(0);
  expect((await box(page.locator("[data-framed-panel]"))).y).toBe(wideTop);
});

test("at 640px the Places button sits on the rail's axis", async ({ page }) => {
  await openWindow(page, narrow);
  const places = await box(page.locator("header").getByRole("button", { name: "Places" }));
  expect(places.x + places.width / 2).toBe(railAxis);
});

/** The WCAG relative luminance of a computed `rgb(r, g, b)` colour. */
function luminance(colour: string): number {
  const channels =
    colour
      .match(/\d+(\.\d+)?/g)
      ?.slice(0, 3)
      .map(Number) ?? [];
  if (channels.length !== 3) {
    throw new Error(`"${colour}" isn't an rgb() colour.`);
  }
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The WCAG contrast of two computed colours. */
function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

async function selectedHomeInDark(page: Page) {
  const rail = await openWindow(page, wide);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    // The buttons' colours ease to the dark theme's; reading a style starts those transitions,
    // and finishing them reads the dark colours at once, without waiting.
    getComputedStyle(document.documentElement).color;
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
  });
  const home = rail.getByRole("button", { name: "Home", exact: true });
  return { home, solid: home.locator('[data-place-icon="home-filled"] path[fill="currentColor"]') };
}

/**
 * `shell.rail-dot-seat`: the white dot lies on the selected drawing's dark glass in dark too, not
 * on a fill in the near-white text colour, and the drawing's edge keeps the text colour so the
 * drawing reads on the dark circle (HAL-21048, post-merge check HAL-21037). Playwright has no
 * `verifies()`; the jsdom test in `icon-rail.test.tsx` names the requirement.
 */
test("at 1280px in dark the white dot reads at 3:1 or more on the selected drawing", async ({
  page,
}) => {
  const { solid } = await selectedHomeInDark(page);
  const fill = await solid.evaluate((path) => getComputedStyle(path).fill);
  expect(fill).toBe("rgb(10, 22, 48)");
  expect(contrast("rgb(255, 255, 255)", fill)).toBeGreaterThanOrEqual(3);
});

test("at 1280px in dark the selected drawing's edge reads at 3:1 or more on its circle", async ({
  page,
}) => {
  const { home, solid } = await selectedHomeInDark(page);
  const edge = await solid.evaluate((path) => getComputedStyle(path).stroke);
  const circle = await home.evaluate((button) => getComputedStyle(button).backgroundColor);
  expect(circle).toBe("rgb(13, 28, 62)");
  expect(contrast(edge, circle)).toBeGreaterThanOrEqual(3);
});

/** Selects an entry, then switches the window to a theme and finishes the colours' easing. */
async function selected(page: Page, name: string, theme: "light" | "dark") {
  const rail = await openWindow(page, wide);
  const button = rail.getByRole("button", { name, exact: true });
  await button.click();
  await page.evaluate((chosen) => {
    document.documentElement.setAttribute("data-theme", chosen);
    getComputedStyle(document.documentElement).color;
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
  }, theme);
  const glass = button.locator("[data-rail-glass]");
  await expect(glass).toBeVisible();
  return {
    fill: await glass
      .locator('path[fill="currentColor"]')
      .evaluate((path) => getComputedStyle(path).fill),
    marks: await glass
      .locator("[data-rail-marks] path")
      .evaluate((path) => getComputedStyle(path).stroke),
  };
}

/**
 * `shell.rail-inner-mark`: in dark the selected drawing's inner marks are drawn in the text
 * colour over the glass, not left as cut-outs that show the equally dark circle (HAL-21085);
 * in light the line over them is see-through, so light looks as before. The jsdom test in
 * `icon-rail.test.tsx` names the requirement.
 */
for (const name of ["Runs", "Changes", "Inbox"]) {
  test(`at 1280px in dark the inner mark of ${name} reads at 3:1 or more on the glass`, async ({
    page,
  }) => {
    const { fill, marks } = await selected(page, name, "dark");
    expect(fill).toBe("rgb(10, 22, 48)");
    expect(contrast(marks, fill)).toBeGreaterThanOrEqual(3);
  });
}

test("at 1280px in light the line over the selected drawing is see-through", async ({ page }) => {
  const { marks } = await selected(page, "Inbox", "light");
  expect(marks).toBe("rgba(0, 0, 0, 0)");
});
