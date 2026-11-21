import { expect, test } from "@playwright/test";

/**
 * The agent page on Flow (HAL-13180), with a card on each side of the map. The unit tests fake the
 * map panel's size, so this is where a panel that ends up with no room shows: the spec checks the
 * panel has height and the fitted map's cards sit inside it, then takes the screenshot
 * `agent-map-<light|dark>.png` (docs/guides/e2e-screenshots.md).
 */
const schemes = ["light", "dark"] as const;

test.use({ viewport: { width: 1440, height: 900 } });

for (const scheme of schemes) {
  test(`agent map, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/agent-map.html");
    await expect(page.getByRole("region", { name: "How Triage fits in" })).toBeVisible();
    const panel = await page.locator("[data-map-panel]").boundingBox();
    expect(panel, "the map's panel is shown").not.toBeNull();
    if (panel === null) return;
    expect(panel.height, "the map's panel has room").toBeGreaterThan(300);
    for (const name of [
      "Agent Reply writer",
      "Agent Inbox watcher",
      "Skill Tone",
      "Add subagent",
    ]) {
      const card = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(card, `${name} is shown`).not.toBeNull();
      if (card === null) continue;
      expect(card.y, `${name} is below the panel's top`).toBeGreaterThanOrEqual(panel.y);
      expect(card.y + card.height, `${name} is above the panel's bottom`).toBeLessThanOrEqual(
        panel.y + panel.height,
      );
    }
    await page.screenshot({
      path: `test-results/screenshots/agent-map-${scheme}.png`,
      fullPage: true,
    });
  });
}
