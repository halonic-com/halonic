import { expect, type Page, test } from "@playwright/test";

/**
 * A page opened from a Settings section takes the focus on its `h1` at every width (C383 SP1).
 * Settings opens from the rail's Settings button, which stays outside the Places drawer at 640px,
 * as at 200 % zoom on a 1280px screen, so Escape gives the focus back to it at every width
 * (`shell.sidebar-settings`). jsdom has no `inert` and no dialog focus return, so a real browser
 * checks it.
 */
const widths = [
  { name: "a narrow window", width: 640, height: 400 },
  { name: "a wide window", width: 1280, height: 800 },
];

function railSettings(page: Page) {
  return page.getByRole("navigation", { name: "Apps" }).getByRole("button", { name: "Settings" });
}

async function openSettings(page: Page) {
  await railSettings(page).press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

for (const layout of widths) {
  test(`a plugin opened from Settings takes the focus on its h1, in ${layout.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto("/settings-open-page.html");
    await openSettings(page);

    await page
      .getByRole("dialog", { name: "Settings" })
      .getByRole("button", { name: "Weather" })
      .press("Enter");

    await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "Plugin Weather", level: 1 })).toBeFocused();
  });
}

for (const layout of widths) {
  test(`Escape from Settings gives the focus back to the rail's Settings, in ${layout.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto("/settings-open-page.html");
    await openSettings(page);

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
    await expect(railSettings(page)).toBeFocused();
  });
}
