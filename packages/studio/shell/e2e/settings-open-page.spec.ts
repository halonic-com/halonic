import { expect, type Page, test } from "@playwright/test";

/**
 * A page opened from a Settings section takes the focus on its `h1` at every width (C383 SP1). At
 * 640px, as at 200 % zoom on a 1280px screen, Settings opens from the Places drawer, and its opener,
 * the drawer's Settings row, is hidden once the drawer closes: Settings then gives the focus to
 * Places, which must not stop the page's `h1` from taking it once drawn. Escape still lands on
 * Places. jsdom has no `inert` and no dialog focus return, so a real browser checks it.
 */
const widths = [
  { name: "a narrow window", width: 640, height: 400, narrow: true },
  { name: "a wide window", width: 1280, height: 800, narrow: false },
];

async function openSettings(page: Page, narrow: boolean) {
  if (narrow) {
    await page.getByRole("button", { name: "Places" }).click();
  }
  await page
    .getByRole("navigation", { name: "Places" })
    .getByRole("button", { name: "Settings" })
    .press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

for (const layout of widths) {
  test(`a plugin opened from Settings takes the focus on its h1, in ${layout.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto("/settings-open-page.html");
    await openSettings(page, layout.narrow);

    await page
      .getByRole("dialog", { name: "Settings" })
      .getByRole("button", { name: "Weather" })
      .press("Enter");

    await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "Plugin Weather", level: 1 })).toBeFocused();
  });
}

test("Escape from Settings opened from the Places drawer puts the focus on Places", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto("/settings-open-page.html");
  await openSettings(page, true);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Places" })).toBeFocused();
});
