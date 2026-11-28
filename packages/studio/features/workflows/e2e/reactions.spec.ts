import { expect, test } from "@playwright/test";

/**
 * Reactions on the phone and in a narrow desktop chat (HAL-20426), for the look check:
 * `phone-reactions-chips-<light|dark>.png` is the phone's chat at 390 px with chips under Elena's
 * message and the person's own, `phone-reactions-sheet-<light|dark>.png` the same chat with the
 * long-press sheet open on Elena's, and `messenger-reactions-row-<agent|own>-<light|dark>.png` the
 * Messenger's chat in a 600 px pane with the "Add a reaction" row open beside "Morning" or "Thanks"
 * (docs/guides/e2e-screenshots.md).
 */
for (const scheme of ["light", "dark"] as const) {
  test(`phone reactions, chips, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/phone-reactions.html");
    await expect(page.locator('li[data-message-id="m2"] [data-chip]')).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/phone-reactions-chips-${scheme}.png`,
      fullPage: true,
    });
  });

  test(`phone reactions, long-press sheet, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/phone-reactions.html");
    const message = page.locator('li[data-message-id="m1"] p').first();
    await expect(message).toBeVisible();
    // A finger's long-press ends in the browser's context menu, which opens the sheet.
    await message.dispatchEvent("contextmenu");
    const sheet = page.getByRole("dialog", { name: "React to Elena's message" });
    await expect(sheet.getByRole("button", { name: "Copy text" })).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/phone-reactions-sheet-${scheme}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });

  for (const [index, who] of [
    [0, "agent"],
    [1, "own"],
  ] as const) {
    test(`messenger reactions, row beside the ${who} message, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 600, height: 480 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/messenger-reactions.html");
      await page.getByRole("button", { name: "Add a reaction", exact: true }).nth(index).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/messenger-reactions-row-${who}-${scheme}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}
