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
  return controlNamed(
    "(self::button or self::a or @role='button' or @role='tab' or @role='gridcell')",
    text,
  );
}

/**
 * An XPath for a tab named `text`, such as an agent page's Configuration or a Configuration page,
 * where a button or link with the same words elsewhere on the page mustn't be clicked instead. A
 * tab with a counter also holds the count, so its part that holds `text` counts too.
 */
export function tabNamed(text: string): string {
  return controlNamed("@role='tab'", text);
}

/** A `control` with `text` as its words, its accessible name, or a part of it that isn't hidden. */
function controlNamed(control: string, text: string): string {
  const named = `normalize-space()=${xpathString(text)}`;
  const hidden =
    "ancestor-or-self::*[contains(concat(' ', normalize-space(@class), ' '), ' invisible ')]";
  const shownPart = `.//*[${named} and not(${hidden})]`;
  const name = `(${named} or @aria-label=${xpathString(text)} or ${shownPart})`;
  return `//*[${control} and ${name} and not(@disabled) and not(@aria-disabled='true')]`;
}

/**
 * An XPath for a kit RadioGroup's option by its words: a native radio named by the label's
 * `aria-labelledby` words only, since its note sits in the same label.
 */
export function radioNamed(text: string): string {
  const words = `//*[normalize-space()=${xpathString(text)}]/@id`;
  return `//input[@type='radio' and not(@disabled) and @aria-labelledby=${words}]`;
}

/** Clicks the element `xpath` finds once it shows and is enabled, waiting at most `waitMs`. */
export async function clickXPathWhenShown(
  context: StepContext,
  xpath: string,
  waitMs: number,
): Promise<boolean> {
  return (await clickXPathOrWhyNot(context, xpath, waitMs)) === undefined;
}

/**
 * An XPath for a place, such as Overview, by its name in the sidebar's Places list. Only there:
 * the window's "1 open tab" menu is a closed popover holding a hidden button named after the
 * open tab, and it comes first in the page, so a plain {@link buttonNamed} finds that one and the
 * click is refused (HAL-19099).
 */
export function placeNamed(text: string): string {
  return `${placesList}${buttonNamed(text)}`;
}

/** The sidebar's Places list, a `nav` named "Places" (`places-list.tsx`). */
export const placesList = "//nav[@aria-label='Places']";

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
  return clickXPathOrWhyNot(context, buttonNamed(text), waitMs);
}

/** Clicks the place with this name in the Places list once it shows, waiting at most `waitMs`. */
export async function clickPlaceWhenShown(
  context: StepContext,
  text: string,
  waitMs: number,
): Promise<boolean> {
  return (await clickXPathOrWhyNot(context, placeNamed(text), waitMs)) === undefined;
}

/**
 * An XPath for an option of a native select, by its whole text, or by how it
 * starts when `startsWith` is set (a Format option that names the computer's own format).
 */
export function optionNamed(text: string, startsWith = false): string {
  const named = startsWith
    ? `starts-with(normalize-space(),${xpathString(text)})`
    : `normalize-space()=${xpathString(text)}`;
  return `//option[${named} and not(@disabled)]`;
}

/**
 * Picks an option of a native select, as a click on it does, waiting at most
 * `waitMs` for it to show. Returns whether the pick landed.
 */
export async function pickWhenShown(
  context: StepContext,
  option: string,
  waitMs: number,
): Promise<boolean> {
  return (await clickXPathOrWhyNot(context, option, waitMs)) === undefined;
}

async function clickXPathOrWhyNot(
  context: StepContext,
  xpath: string,
  waitMs: number,
): Promise<string | undefined> {
  let whyNot = "never tried";
  const reads = Math.max(1, Math.ceil(waitMs / pollEveryMs));
  for (let read = 0; read < reads; read += 1) {
    const failed = await context.driver.click(xpath).then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    if (failed === undefined) return undefined;
    whyNot = failed;
    await context.sleep(pollEveryMs);
  }
  return whyNot;
}

/** The parts of `wanted` the text lacks, quoted and joined for a step's note. */
export function missingParts(wanted: readonly string[], text: string): string {
  return wanted
    .filter((part) => !text.includes(part))
    .map((part) => `"${part}"`)
    .join(", ");
}

/**
 * An XPath for the innermost row, cell or button whose text holds `text`, for
 * rows whose whole text isn't known, such as an Inbox row with its meta line.
 */
export function rowContaining(text: string): string {
  const control = "(self::button or @role='button' or @role='gridcell' or @role='option')";
  return `(//*[${control} and contains(normalize-space(), ${xpathString(text)})])[last()]`;
}

/** Clicks the row holding `text` once it shows, waiting at most `waitMs`. */
export async function clickRow(
  context: StepContext,
  text: string,
  waitMs: number,
): Promise<boolean> {
  return (await clickXPathOrWhyNot(context, rowContaining(text), waitMs)) === undefined;
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
