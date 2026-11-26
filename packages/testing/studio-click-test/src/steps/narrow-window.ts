import type { StepContext } from "../runner.ts";
import { basicsText } from "../words.ts";

/**
 * The narrow window's Places button (600 to 899px), in the state `expanded` names. The click test's
 * 800px window is narrow, so its sidebar, with the workspace switcher, is a drawer this button opens
 * (studio-preview run 45731345493).
 */
export function placesButtonXpath(expanded: boolean): string {
  return `//button[@aria-label='${basicsText.placesButton.text}' and @aria-expanded='${expanded}']`;
}

/** Opens the Places drawer when the sidebar is folded into it. A wide window has no such button. */
export async function unfoldSidebar(context: StepContext): Promise<void> {
  const folded = placesButtonXpath(false);
  if ((await context.driver.count(folded)) > 0) await context.driver.click(folded);
}

/** Closes the Places drawer again when it's open, so the page beside it takes clicks. */
export async function foldSidebar(context: StepContext): Promise<void> {
  const unfolded = placesButtonXpath(true);
  if ((await context.driver.count(unfolded)) > 0) await context.driver.click(unfolded);
}

const foldedTabsPattern = new RegExp(`(\\d+)${basicsText.foldedTabs.text}s?\\b`);

/**
 * How many tabs the folded tabs badge counts, "3 open tabs ▾", which the narrow window shows instead
 * of the Open tabs strip; 0 when the page shows no such badge.
 */
export function foldedTabCount(pageText: string): number {
  const match = foldedTabsPattern.exec(pageText);
  return match === null ? 0 : Number(match[1]);
}
