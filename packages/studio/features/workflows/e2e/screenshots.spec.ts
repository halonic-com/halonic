import { expect, type Page, test } from "@playwright/test";

/**
 * Screenshots of Studio's screens for a pull request's reviewer, who has no browser (HAL-10393):
 * one full-page PNG per screen, state and colour scheme, in `test-results/screenshots/`, which CI's
 * `e2e` job uploads as the `studio-screenshots` artifact. They are looked at, not compared: the
 * only check is that the screen is shown.
 *
 * To add a screen, add its page in `e2e/pages` (and to `vite.config.ts`), then add its states below.
 */

/** Every button of the card sits whole inside the card, so none is cut off at an edge (HAL-11906). */
async function expectButtonsWhole(page: Page): Promise<void> {
  const card = await page.getByRole("region").boundingBox();
  expect(card, "the card is shown").not.toBeNull();
  if (card === null) return;
  for (const button of await page.getByRole("region").getByRole("button").all()) {
    const box = await button.boundingBox();
    const name = (await button.textContent())?.trim() ?? "a button";
    expect(box, `${name} is shown`).not.toBeNull();
    if (box === null) continue;
    expect(box.x, `${name} is inside the card's left edge`).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width, `${name} is inside the card's right edge`).toBeLessThanOrEqual(
      card.x + card.width,
    );
    expect(box.y, `${name} is inside the card's top edge`).toBeGreaterThanOrEqual(card.y);
    expect(box.y + box.height, `${name} is inside the card's bottom edge`).toBeLessThanOrEqual(
      card.y + card.height,
    );
  }
}

const states = ["finished", "waiting", "failed"] as const;
const schemes = ["light", "dark"] as const;

test.use({ viewport: { width: 1440, height: 900 } });

for (const state of states) {
  for (const scheme of schemes) {
    test(`run card, ${state}, ${scheme}`, async ({ page }) => {
      const problems: string[] = [];
      page.on("pageerror", (error) =>
        problems.push(`${error.message} @ ${(error.stack ?? "").slice(0, 600)}`),
      );
      page.on("console", (message) =>
        problems.push(`console ${message.type()}: ${message.text()}`),
      );
      page.on("requestfailed", (request) => problems.push(`${request.url()} failed`));
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/run-card.html?state=${state}`);
      await expect(
        page.getByRole("complementary", { name: "Run 01jd8q" }),
        problems.join("; ") || "the page threw nothing",
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/run-card-${state}-${scheme}.png`,
        fullPage: true,
      });
    });
  }
}

/**
 * The first-start sandbox choice (HAL-5405) on a Windows PC, at the window sizes the plan names
 * (HAL-3777): the halo must stay partly visible around the card at each. Every screen at the largest
 * size, and the first screen at the others.
 */
const sizes = [
  { width: 1280, height: 800 },
  { width: 1000, height: 700 },
  { width: 720, height: 560 },
  { width: 480, height: 640 },
] as const;
const choiceScreens = ["choose", "more-info", "options", "confirm-none"] as const;

for (const size of sizes) {
  for (const screen of choiceScreens) {
    if (screen !== "choose" && size !== sizes[0]) continue;
    for (const scheme of schemes) {
      test(`sandbox choice, ${screen}, ${size.width}x${size.height}, ${scheme}`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/sandbox-choice.html?screen=${screen}`);
        await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
        await expect(page.getByTestId("sandbox-halo")).toBeAttached();
        await expectButtonsWhole(page);
        if (screen === "choose" && size.width !== 1000 && size.width !== 480) {
          // The recommended card is never cut (HAL-11906): its last line is shown whole, above the action row.
          const last = await page
            .getByText("Files on your Windows drive are slower", { exact: true })
            .boundingBox();
          const footer = await page.getByRole("region").locator("footer").boundingBox();
          expect(last, "the recommended card's last line is shown").not.toBeNull();
          expect(footer, "the action row is shown").not.toBeNull();
          if (last !== null && footer !== null) {
            expect(
              last.y + last.height,
              "the last line is above the action row",
            ).toBeLessThanOrEqual(footer.y);
          }
        }
        if (screen === "choose") {
          // A full-page shot can't show content that scrolls inside the card, so check the main
          // button sits inside the window and the links keep clear of the card's bottom edge.
          const card = await page.getByRole("region").boundingBox();
          const setUp = await page
            .getByRole("button", { name: /set up/i })
            .first()
            .boundingBox();
          const more = await page.getByRole("button", { name: "More info" }).boundingBox();
          expect(card, "the card is shown").not.toBeNull();
          expect(setUp, "Set up is shown").not.toBeNull();
          expect(more, "More info is shown").not.toBeNull();
          if (card !== null && setUp !== null && more !== null) {
            expect(setUp.y + setUp.height, "Set up is inside the card").toBeLessThanOrEqual(
              card.y + card.height,
            );
            expect(setUp.y, "Set up is inside the window").toBeGreaterThanOrEqual(0);
            expect(
              setUp.y + setUp.height,
              "Set up is above the window's bottom",
            ).toBeLessThanOrEqual(size.height);
            expect(more.y + more.height, "links clear the card edge").toBeLessThanOrEqual(
              card.y + card.height - 8,
            );
          }
        }
        await page.screenshot({
          path: `test-results/screenshots/sandbox-choice-${screen}-${size.width}x${size.height}-${scheme}.png`,
          fullPage: true,
        });
      });
    }
  }
}

/** The sandbox setup screens (HAL-5405, S3 to S5) at the plan's largest size, and the busiest at the smallest. */
const setupScreens = [
  "setting-up",
  "offline",
  "restart-needed",
  "cant-set-up",
  "tool-missing",
  "testing",
  "test-failed",
  "done",
  "done-none",
] as const;

for (const screen of setupScreens) {
  for (const size of [sizes[0], sizes[3]]) {
    if (size === sizes[3] && screen !== "offline" && screen !== "tool-missing") continue;
    for (const scheme of schemes) {
      test(`sandbox setup, ${screen}, ${size.width}x${size.height}, ${scheme}`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/sandbox-setup.html?state=${screen}`);
        await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
        await expect(page.getByTestId("sandbox-halo")).toBeAttached();
        await expectButtonsWhole(page);
        if (screen === "offline") {
          // The step that stopped says so and has no spinner (HAL-11906, A6).
          await expect(page.getByText("Stopped")).toBeVisible();
          await expect(page.getByText("Working…")).toHaveCount(0);
        }
        // The card's last button must stay reachable inside the window (the body scrolls, the actions don't).
        const card = await page.getByRole("region").boundingBox();
        expect(card, "the card is shown").not.toBeNull();
        if (card !== null) {
          expect(card.y + card.height, "the card fits the window").toBeLessThanOrEqual(size.height);
        }
        await page.screenshot({
          path: `test-results/screenshots/sandbox-setup-${screen}-${size.width}x${size.height}-${scheme}.png`,
          fullPage: true,
        });
      });
    }
  }
}

/**
 * Settings sections and the Agents list (HAL-11861), drawn from made-up data, at 1440 × 900 like
 * the run card. Settings is the shell's real dialog, open on one section; the Agents list has two
 * hubs. The phone's Settings sheet isn't taken: this guide doesn't cover phone screens yet.
 */
const settingsSections = [
  "models",
  "trusted-sources",
  "agent-sandbox",
  "formats",
  "plugins",
] as const;

for (const section of settingsSections) {
  for (const scheme of schemes) {
    test(`settings, ${section}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/settings.html?section=${section}`);
      await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
      await expect(page.locator("section[aria-labelledby] > h3")).toBeVisible();
      // The section's own view loads after its name, so wait for something past the heading.
      await expect(page.locator("section[aria-labelledby] > div").last()).not.toBeEmpty();
      await page.screenshot({
        path: `test-results/screenshots/settings-${section}-${scheme}.png`,
        fullPage: true,
      });
    });
  }
}

for (const scheme of schemes) {
  test(`agents list, two groups, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/agents-list.html");
    await expect(page.getByRole("heading", { name: "Agents", level: 1 })).toBeVisible();
    await expect(page.getByText("Triage")).toBeVisible();
    await expect(page.getByText("Lead scout")).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/agents-list-two-groups-${scheme}.png`,
      fullPage: true,
    });
  });
}
