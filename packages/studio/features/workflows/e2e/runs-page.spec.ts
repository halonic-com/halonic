import { expect, test } from "@playwright/test";

/**
 * The Runs page in the two-column layout (`runs.list-column`, HAL-20729), for its design check:
 * `runs-page-<empty|open|one-pane>-<light|dark>.png` in the `studio-screenshots` artifact. Empty is
 * the list column with no run open; open has "Support reply" open in the content pane; one pane is
 * a 390 px window with the run open alone under **Back to Runs**.
 */

const schemes = ["light", "dark"] as const;

for (const scheme of schemes) {
  test(`runs page, empty and open, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/runs-page.html");
    await expect(page.getByText("No run open")).toBeVisible();
    await page.screenshot({ path: `test-results/screenshots/runs-page-empty-${scheme}.png` });
    await page.getByText("Support reply", { exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Run 7f3a2b" })).toBeVisible();
    await page.screenshot({ path: `test-results/screenshots/runs-page-open-${scheme}.png` });
  });

  test(`runs page, one pane, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/runs-page.html?narrow=1");
    await page.getByText("Support reply", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Back to Runs" })).toBeFocused();
    await expect(page.getByRole("heading", { level: 1, name: "Run 7f3a2b" })).toBeVisible();
    await page.screenshot({ path: `test-results/screenshots/runs-page-one-pane-${scheme}.png` });
  });
}
