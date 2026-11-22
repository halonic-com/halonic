import { expect, type Locator, type Page, test } from "@playwright/test";
import { contrasts, readColours } from "./contrast.ts";

/**
 * "Allow this address?" (`models.key-address.allow-address`, HAL-15873) in a real Chromium, over
 * the run that asks it. Screenshots of the dialog and of the step that shows "Waiting for your
 * answer", in both colour schemes, for the pull request's record, and row X-5 of the UX checklist
 * on HAL-11873: text 4.5:1, borders and the focus ring 3:1, in both schemes, and the dialog still
 * usable at 200 % zoom and in a 320 px wide window, with no sideways scrolling and no cut text.
 */

const schemes = ["light", "dark"] as const;
const address = "https://gateway.example.com";

test.use({ viewport: { width: 1280, height: 800 } });

/** Opens the page and returns the dialog, failing with anything the page threw. */
async function openDialog(page: Page): Promise<Locator> {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/allow-address.html");
  const dialog = page.getByRole("alertdialog", { name: "Allow this address?" });
  await expect(dialog, problems.join("; ") || "the page threw nothing").toBeVisible();
  return dialog;
}

for (const scheme of schemes) {
  test(`the dialog over the run, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await openDialog(page);
    await expect(dialog.getByText(address, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Don't allow" })).toBeFocused();
    await page.screenshot({ path: `test-results/screenshots/allow-address-dialog-${scheme}.png` });
  });

  test(`the step waits for the answer, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/allow-address.html?dialog=none");
    await expect(page.getByText("Waiting for your answer")).toBeVisible();
    await page.locator("#shot").screenshot({
      path: `test-results/screenshots/allow-address-waiting-${scheme}.png`,
    });
  });

  test(`X-5: text 4.5:1, borders and the focus ring 3:1, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const dialog = await openDialog(page);

    // Focus starts on Don't allow; Tab and back draws its ring as a keyboard user sees it.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Don't allow" })).toBeFocused();
    const { texts, edges } = contrasts(await dialog.evaluate(readColours));

    expect(texts.length, "the dialog's text is measured").toBeGreaterThanOrEqual(6);
    for (const { what, ratio } of texts) {
      expect(ratio, `"${what}" has 4.5:1`).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      edges.some((edge) => edge.what.startsWith("the focus ring")),
      "the focus ring is measured",
    ).toBe(true);
    for (const { what, ratio } of edges) {
      expect(ratio, `${what} has 3:1`).toBeGreaterThanOrEqual(3);
    }
  });
}

/**
 * 640 × 400 is a 1280 × 800 window at 200 %; 320 px is a 1280 px one at 400 % (WCAG 1.4.10). The
 * dialog may scroll up and down, but nothing scrolls sideways, no line is cut, the whole address
 * is there, and both buttons can be reached.
 */
const narrow = [
  { name: "at 200 % zoom", width: 640, height: 400 },
  { name: "in a 320 px wide window", width: 320, height: 568 },
] as const;

for (const { name, width, height } of narrow) {
  test(`X-5: usable ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const dialog = await openDialog(page);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways, "the page doesn't scroll sideways").toBeLessThanOrEqual(0);

    const box = await dialog.boundingBox();
    expect(box, "the dialog is shown").not.toBeNull();
    expect(box?.x ?? -1, "the dialog's left edge is on screen").toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? width + 1), "its right edge too").toBeLessThanOrEqual(
      width,
    );

    const cut = await dialog.evaluate((element) =>
      [element, ...element.querySelectorAll("*")]
        .filter((part) => part.getClientRects().length > 0)
        .filter((part) => part.scrollWidth > part.clientWidth + 1)
        .map((part) => `${part.tagName.toLowerCase()} "${part.textContent?.slice(0, 40)}"`),
    );
    expect(cut, "nothing in the dialog is wider than its box").toEqual([]);

    await expect(dialog.getByText(address, { exact: true })).toBeVisible();
    for (const label of ["Allow this address", "Don't allow"]) {
      const button = dialog.getByRole("button", { name: label });
      await button.scrollIntoViewIfNeeded();
      await expect(button, `${label} can be reached`).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({
      path: `test-results/screenshots/allow-address-dialog-${width}.png`,
    });
  });
}
