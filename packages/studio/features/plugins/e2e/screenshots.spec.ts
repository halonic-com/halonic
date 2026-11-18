import { expect, type Page, test } from "@playwright/test";

/**
 * Screenshots of the plugin screens for a reviewer without a browser (HAL-1740, T16 in the visual
 * review kit): one full-page PNG per step of the flow page and colour scheme, in
 * `test-results/screenshots/plugins-<step>-<light|dark>.png`, which CI's `e2e` job uploads with
 * the `studio-screenshots` artifact (docs/guides/e2e-screenshots.md). They are looked at, not
 * compared: the only checks are that each step's screen is shown.
 */
const schemes = ["light", "dark"] as const;

test.use({ viewport: { width: 1440, height: 900 } });

async function shoot(page: Page, step: string, scheme: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/plugins-${step}-${scheme}.png`,
    fullPage: true,
    // A dialog fades in: without this the shot catches it half drawn, with the backdrop not dimmed.
    animations: "disabled",
  });
}

for (const scheme of schemes) {
  test(`plugin screens, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/flow.html");
    await expect(page.getByText("No plugins yet")).toBeVisible();
    await shoot(page, "empty", scheme);

    await page.getByRole("button", { name: "Add plugin" }).click();
    const add = page.getByRole("dialog", { name: "Add a plugin" });
    await add.getByRole("textbox", { name: "Folder" }).fill("plugins/halonic-weather");
    await shoot(page, "add", scheme);
    await add.getByRole("button", { name: "Add", exact: true }).click();

    const trust = page.getByRole("dialog", { name: "Trust Weather and turn it on?" });
    await expect(trust).toBeVisible();
    await shoot(page, "trust-check", scheme);
    await trust.getByRole("button", { name: "Trust and turn on" }).click();
    await expect(trust).toBeHidden();

    await expect(page.getByText("Weather is on")).toBeVisible();
    await shoot(page, "on", scheme);

    await page.getByRole("button", { name: "Show the forecast" }).click();
    const command = page.getByRole("dialog", { name: "Show the forecast" });
    await expect(command).toContainText("Sunny, 18 degrees in Ghent.");
    await shoot(page, "command-result", scheme);
    await command.getByRole("button", { name: "Close", exact: true }).click();
    await expect(command).toBeHidden();

    await page.getByRole("button", { name: "More actions for Weather" }).click();
    await page.getByRole("menuitem", { name: "Remove plugin…" }).click();
    await expect(page.getByRole("dialog", { name: "Remove Weather?" })).toBeVisible();
    await shoot(page, "remove", scheme);
  });
}

/** The screens the flow doesn't reach (e2e/pages/screens.tsx), each with a line it must show. */
const screens = {
  "page-on": "What it adds",
  "page-not-trusted": "What it adds",
  "page-cant-load": "uses the tool send_email, which sends.",
  panel: "Sunny, 18 degrees in Ghent.",
  cards: "Couldn't get Today's weather",
} as const;

for (const [screen, shown] of Object.entries(screens)) {
  for (const scheme of schemes) {
    test(`plugin screen, ${screen}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/screens.html?screen=${screen}`);
      await expect(page.getByText(shown).first()).toBeVisible();
      await shoot(page, screen, scheme);
    });
  }
}
