import type { StepContext } from "./runner.ts";

/** How often the steps read the screen again while they wait. */
export const pollEveryMs = 2_000;

/**
 * An XPath for a control (a button, link, tab or list row) whose visible text or
 * accessible name is exactly `text`, and that isn't disabled. A kit Button
 * with a busy label also holds its busy copy, hidden with `invisible`, so its
 * whole text is never just `text`: a part of it that isn't hidden counts too.
 */
export function buttonNamed(text: string): string {
  // A kit List row opens from its gridcell, whose title isn't a button (run 45665141501).
  const control = "(self::button or self::a or @role='button' or @role='tab' or @role='gridcell')";
  const named = `normalize-space()=${xpathString(text)}`;
  const hidden =
    "ancestor-or-self::*[contains(concat(' ', normalize-space(@class), ' '), ' invisible ')]";
  const shownPart = `.//*[${named} and not(${hidden})]`;
  const name = `(${named} or @aria-label=${xpathString(text)} or ${shownPart})`;
  return `//*[${control} and ${name} and not(@disabled) and not(@aria-disabled='true')]`;
}

/**
 * Reads the page until `found` returns something, for at most `waitMs`, and
 * returns that, or undefined with the last text read. A read that fails (the
 * window is still loading) counts as an empty page.
 */
export async function waitForText<T>(
  context: StepContext,
  waitMs: number,
  found: (text: string) => T | undefined,
): Promise<{ value: T | undefined; text: string }> {
  let text = "";
  const reads = Math.max(1, Math.ceil(waitMs / pollEveryMs));
  for (let read = 0; read < reads; read += 1) {
    text = await context.driver.pageText().catch(() => "");
    const value = found(text);
    if (value !== undefined) return { value, text };
    await context.sleep(pollEveryMs);
  }
  return { value: undefined, text };
}

/** Clicks the button with this text once it shows and is enabled, waiting at most `waitMs`. */
export async function clickWhenShown(
  context: StepContext,
  text: string,
  waitMs: number,
): Promise<boolean> {
  return (await clickOrWhyNot(context, text, waitMs)) === undefined;
}

/**
 * Like {@link clickWhenShown}, but returns why the last try failed (the
 * driver's error), or undefined once the click landed, so a failing step can
 * tell "not there" from "there but refused".
 */
export async function clickOrWhyNot(
  context: StepContext,
  text: string,
  waitMs: number,
): Promise<string | undefined> {
  let whyNot = "never tried";
  const reads = Math.max(1, Math.ceil(waitMs / pollEveryMs));
  for (let read = 0; read < reads; read += 1) {
    const failed = await context.driver.click(buttonNamed(text)).then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    if (failed === undefined) return undefined;
    whyNot = failed;
    await context.sleep(pollEveryMs);
  }
  return whyNot;
}

/** The end of the page text, short enough for the results table. */
export function lastWords(text: string): string {
  const flat = text.replaceAll(/\s+/g, " ").trim();
  return flat.length <= 200 ? flat : `…${flat.slice(-200)}`;
}

// XPath 1.0 has no escape for quotes, so a text holding both kinds goes in concat().
function xpathString(text: string): string {
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  return `concat('${text.replaceAll("'", `', "'", '`)}')`;
}
