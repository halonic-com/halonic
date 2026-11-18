import { expect, type Page, test } from "@playwright/test";

/**
 * A save problem fills the status bar on the desktop, and shows in a strip under the top bar on a
 * phone (`shell.save-note`). The fill and the strip come from CSS `:has()` reading the note's
 * `data-problem`, which jsdom doesn't apply, so they are read in a real Chromium and WebKit.
 */

const desktop = { width: 1280, height: 720 };
const phone = { width: 390, height: 844 };

/** The computed background colour of the first element the selector finds. */
function background(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
}

/** The computed background of an element given only the class, to compare a fill with its token. */
function tokenColour(page: Page, className: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.className = name;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, className);
}

test("the status bar keeps its calm fill while everything is saved", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/save-problem.html");
  await expect(page.locator("footer")).toContainText("Saved");
  expect(await background(page, "footer")).toBe(await tokenColour(page, "bg-surface-subtle"));
});

for (const [state, fill] of [
  ["fields", "bg-warning-soft"],
  ["items", "bg-warning-soft"],
  ["failed", "bg-danger-soft"],
] as const) {
  test(`the status bar takes ${fill} for ${state}`, async ({ page }) => {
    await page.setViewportSize(desktop);
    await page.goto(`/save-problem.html?state=${state}`);
    await expect(page.locator("footer [data-problem]")).toBeVisible();
    await expect.poll(() => background(page, "footer")).toBe(await tokenColour(page, fill));
  });
}

test("Try again fits inside the 24px status bar", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/save-problem.html?state=failed");
  const bar = await page.locator("footer").boundingBox();
  // The failed-save toast has its own Try again; this is the status bar's.
  const button = await page
    .locator("footer")
    .getByRole("button", { name: "Try again" })
    .boundingBox();
  expect(bar?.height).toBe(24);
  expect(button?.y).toBeGreaterThanOrEqual(bar?.y ?? Number.POSITIVE_INFINITY);
  expect((button?.y ?? 0) + (button?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + 24);
});

test("a phone shows no strip while everything is saved", async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto("/save-problem.html");
  await expect(page.getByRole("heading", { name: "Support reply" })).toBeVisible();
  await expect(page.locator("[data-phone-notices]")).toBeHidden();
});

test("a phone shows a failed save under the top bar, with its fill and Try again in view", async ({
  page,
}) => {
  await page.setViewportSize(phone);
  await page.goto("/save-problem.html?state=failed&title=long");
  const strip = page.locator("[data-phone-notices]");
  await expect(strip).toBeVisible();
  await expect
    .poll(() => background(page, "[data-phone-notices]"))
    .toBe(await tokenColour(page, "bg-danger-soft"));
  const box = await strip.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
  expect(box?.width).toBe(phone.width);
  // The long title ends in "…", and Try again stays inside the strip.
  const tryAgain = await strip.getByRole("button", { name: "Try again" }).boundingBox();
  expect((tryAgain?.x ?? 0) + (tryAgain?.width ?? 0)).toBeLessThanOrEqual(phone.width);
  await expect(page.locator("main")).toBeInViewport();
});
