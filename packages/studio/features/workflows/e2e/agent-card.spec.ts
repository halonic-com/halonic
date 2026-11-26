import { expect, test } from "@playwright/test";

/**
 * The Inbox card of an open question from an agent (HAL-19651), for the design check of its lifted
 * card surface (#6502): `agent-card-<light|dark>.png` at 1440 × 900
 * (docs/guides/e2e-screenshots.md).
 */
test.use({ viewport: { width: 1440, height: 900 } });

for (const scheme of ["light", "dark"] as const) {
  test(`agent card, open, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/agent-card.html");
    const card = page.getByRole("region", { name: "Publish the spring price list?" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Robin · Shop manager asks")).toBeVisible();
    await expect(card.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Reject" })).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/agent-card-${scheme}.png`,
      fullPage: true,
    });
  });
}
