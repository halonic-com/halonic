import { expect, test } from "@playwright/test";

/**
 * Who asks as the picture and the item's kind as its badge, at the Inbox row's, the item header's
 * and Needs you's sizes (HAL-19666): `item-pictures-<light|dark>.png`
 * (docs/guides/e2e-screenshots.md).
 */
test.use({ viewport: { width: 1440, height: 900 } });

for (const scheme of ["light", "dark"] as const) {
  test(`item pictures, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/item-pictures.html");
    await expect(page.getByText("Agent with a picture · approval")).toBeVisible();
    // The made-up picture is drawn in each of its three sizes before the shot.
    await expect(page.locator('[data-picture="drawn"]')).toHaveCount(3);
    await page.screenshot({
      path: `test-results/screenshots/item-pictures-${scheme}.png`,
      fullPage: true,
    });
  });
}
