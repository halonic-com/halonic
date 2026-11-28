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
  const panel = await box(page.locator("[data-framed-panel]"));
  expect(apps[0]?.y).toBe(panel.y);
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

/**
 * `shell.rail-dot-seat`: the white dot lies on the selected drawing's dark glass in dark too, not
 * on a fill in the near-white text colour (HAL-21048, post-merge check HAL-21037). Playwright has
 * no `verifies()`; the jsdom test in `icon-rail.test.tsx` names the requirement.
 */
test("at 1280px in dark the white dot reads at 3:1 or more on the selected drawing", async ({
  page,
}) => {
  const rail = await openWindow(page, wide);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  });
  const home = rail.getByRole("button", { name: "Home", exact: true });
  const fill = await home
    .locator('[data-place-icon="home-filled"] path[fill="currentColor"]')
    .evaluate((path) => getComputedStyle(path).fill);
  const contrast = (1 + 0.05) / (luminance(fill) + 0.05);
  expect(fill).toBe("rgb(10, 22, 48)");
  expect(contrast).toBeGreaterThanOrEqual(3);
});
