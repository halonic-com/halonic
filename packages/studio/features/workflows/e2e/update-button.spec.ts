import { expect, test } from "@playwright/test";

/**
 * The title bar's **Update** button and its dialog when an install failed (HAL-19575), for the
 * design check: `update-button-<light|dark>.png` is the bar with the button, and
 * `update-dialog-<signature|failed>-<light|dark>.png` the dialog over it after a press
 * (docs/guides/e2e-screenshots.md).
 */
for (const scheme of ["light", "dark"] as const) {
  test(`update button, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/update-button.html?state=available");
    await expect(
      page.getByRole("button", { name: "Update available: Halonic 0.2.0" }),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/screenshots/update-button-${scheme}.png` });
  });

  for (const state of [
    { name: "signature", action: "Close" },
    { name: "failed", action: "Try again" },
  ] as const) {
    test(`update dialog, ${state.name}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/update-button.html?state=${state.name}`);
      await page.getByRole("button", { name: "Update available: Halonic 0.2.0" }).click();
      const dialog = page.getByRole("dialog", { name: "Update available" });
      await expect(dialog.getByRole("button", { name: state.action, exact: true })).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/update-dialog-${state.name}-${scheme}.png`,
        fullPage: true,
        // The kit Dialog fades in: without this the shot catches it half drawn (plugins spec too).
        animations: "disabled",
      });
    });
  }
}
