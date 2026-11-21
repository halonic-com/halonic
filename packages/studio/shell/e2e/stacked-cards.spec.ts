import { expect, type Page, test } from "@playwright/test";

/**
 * A stacked card's header follows the card's own width (HAL-14711). Under 30rem one ← names where
 * it goes, "← draft-reply", in place of ← and the cut-off path, and a long title wraps instead of
 * being cut; from 30rem up the header keeps ←, the whole path and ✕. jsdom has no layout or
 * container queries, so a real Chromium and WebKit check it.
 */
const twoCards = "/stacked-cards.html?cards=draft-reply,Run%20r-42";

const path = (page: Page) => page.getByRole("navigation", { name: "Card path" });

test("on a phone, ← names the card under the top one and the path is gone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(twoCards);
  const back = page.getByRole("button", { name: "Back to draft-reply" });
  await expect(back).toBeVisible();
  // "Back to" is for screen readers; the button shows ← and the name.
  await expect(back.getByText("draft-reply", { exact: true })).toBeVisible();
  await expect(path(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Close all cards" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveAccessibleName(
    "Run r-42, in Acme Mail › Writer › draft-reply › Run r-42",
  );

  await back.click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("draft-reply");
  await page.getByRole("button", { name: "Back to Writer" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
});

test("on a phone, a long title wraps onto two lines instead of being cut", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/stacked-cards.html?cards=a%20reply%20to%20the%20customer%20who%20wrote%20twice%20about%20the%20same%20invoice",
  );
  const heading = page.getByRole("heading", { level: 2 });
  await expect(heading).toHaveCSS("white-space", "normal");
  const lineHeight = await heading.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).lineHeight),
  );
  const box = await heading.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(lineHeight * 1.5);
});

test("on a desktop, the header keeps ←, the whole path and ✕", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(twoCards);
  await expect(path(page)).toBeVisible();
  await expect(path(page)).toHaveText("Acme Mail›Writer›draft-reply›Run r-42");
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to draft-reply" })).toBeHidden();
});
