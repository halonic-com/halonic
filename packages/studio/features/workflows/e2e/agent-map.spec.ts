import { expect, type Page, test } from "@playwright/test";

/**
 * The agent page on Flow (HAL-13180), with a card on each side of the map. The unit tests fake the
 * map panel's size, so this is where a panel that ends up with no room shows: the spec checks the
 * panel has height and the map's cards sit inside it, on the desktop and on a 360 px phone, then
 * takes the screenshots `agent-map-<light|dark>.png` and `agent-map-phone-<light|dark>.png`
 * (docs/guides/e2e-screenshots.md).
 */
const schemes = ["light", "dark"] as const;
const cards = ["Agent Reply writer", "Agent Inbox watcher", "Skill Tone", "Add subagent"];

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Opens the page in `scheme` and returns the map panel's box, once the map shows. */
async function openMap(page: Page, scheme: (typeof schemes)[number]): Promise<Box | null> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/agent-map.html");
  await expect(page.getByRole("region", { name: "How Triage fits in" })).toBeVisible();
  return page.locator("[data-map-panel]").boundingBox();
}

/** Each card's box, after checking it's shown and doesn't run off the panel's sides. */
async function cardsWithin(page: Page, panel: Box): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const name of cards) {
    const card = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(card, `${name} is shown`).not.toBeNull();
    if (card === null) continue;
    expect(card.x, `${name} is right of the panel's left edge`).toBeGreaterThanOrEqual(panel.x);
    expect(card.x + card.width, `${name} is left of the panel's right edge`).toBeLessThanOrEqual(
      panel.x + panel.width,
    );
    boxes.push(card);
  }
  return boxes;
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const scheme of schemes) {
    test(`agent map, ${scheme}`, async ({ page }) => {
      const panel = await openMap(page, scheme);
      expect(panel, "the map's panel is shown").not.toBeNull();
      if (panel === null) return;
      expect(panel.height, "the map's panel has room").toBeGreaterThan(300);
      for (const card of await cardsWithin(page, panel)) {
        expect(card.y, "the card is below the panel's top").toBeGreaterThanOrEqual(panel.y);
        expect(card.y + card.height, "the card is above the panel's bottom").toBeLessThanOrEqual(
          panel.y + panel.height,
        );
      }
      await page.screenshot({
        path: `test-results/screenshots/agent-map-${scheme}.png`,
        fullPage: true,
      });
    });
  }
});

// The phone's three narrow columns (agents.map.phone-columns, HAL-485 11.6): nothing runs off the
// sides, nothing is shrunk, and every card is a 48 px target.
test.describe("phone", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const scheme of schemes) {
    test(`agent map on a phone, ${scheme}`, async ({ page }) => {
      const panel = await openMap(page, scheme);
      expect(panel, "the map's panel is shown").not.toBeNull();
      if (panel === null) return;
      expect(panel.height, "the map's panel has room").toBeGreaterThan(0);
      await expect(page.locator("[data-map-stacked]"), "the map isn't stacked").toHaveCount(0);
      for (const card of await cardsWithin(page, panel)) {
        expect(card.height, "the card is a 48 px target").toBeGreaterThanOrEqual(48);
      }
      await page.screenshot({
        path: `test-results/screenshots/agent-map-phone-${scheme}.png`,
        fullPage: true,
      });
    });
  }
});
