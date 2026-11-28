import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickWhenShown, clickXPathWhenShown, pollEveryMs } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { buttonLabels } from "../words.ts";
import { failure, waitForCount } from "./files-kit.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";
import { tabXpath } from "./window-tabs.ts";

/** How long the tooltip may take to show or go. */
const tooltipWaitMs = 10_000;

/** The last tab in the strip, which the step clicks so the pointer rests there. */
export const lastTab = `(${tabXpath})[last()]`;

/** The kit Tooltip of the tab before the last: each tab holds its own popover. */
export const tooltipXpath = `(${tabXpath})[last()-1]//*[@role='tooltip']`;

/**
 * The window tabs: with two tabs, ArrowLeft from the clicked last tab moves keyboard focus to the
 * one before it, which shows that tab's kit Tooltip, and Escape hides it again. **+** (New tab)
 * makes the second tab, Ctrl W closes it again after (HAL-20752). The pointer stays on the last
 * tab, as the tooltip shows on hover only after 500ms and the press hides the clicked tab's own.
 */
export const tabTooltip: Step = {
  id: "tab-tooltip",
  title: "A tab's tooltip shows on keyboard focus, and Escape hides it",
  requirements: ["kit.tooltip"],
  run: (context) => inWideWindow(context, () => showsAndHides(context)),
};

async function showsAndHides(context: StepContext): Promise<StepOutcome> {
  const workspace = await onWorkspaceWithoutSettings(context);
  if (!workspace.passed) return workspace;
  const before = await context.driver.count(tabXpath).catch(() => 0);
  if (before === 0) return failure(context, "NO_TABS", "No Open tabs strip.");
  if (!(await clickWhenShown(context, buttonLabels.newTab.text, tooltipWaitMs))) {
    return failure(context, "NO_NEW_TAB_BUTTON", "No New tab button.");
  }
  // New tab opens Ctrl K over the new tab, a modal dialog, so Esc closes it first.
  await context.driver.pressKeys([keys.escape]);
  if (!(await waitForCount(context, tabXpath, (count) => count === before + 1))) {
    return failure(context, "TAB_NOT_OPENED", "New tab added no tab.");
  }
  const outcome = await tooltipOnFocus(context);
  // Leaves the window with the tabs it had, for the steps after this one.
  await context.driver.pressKeys([keys.control, "w"]);
  return outcome;
}

async function tooltipOnFocus(context: StepContext): Promise<StepOutcome> {
  if (!(await clickXPathWhenShown(context, lastTab, tooltipWaitMs))) {
    return failure(context, "NO_LAST_TAB", "The new tab couldn't be clicked.");
  }
  await context.driver.pressKeys([keys.arrowLeft]);
  const shown = await displayIs(context, (display) => display !== "" && display !== "none");
  if (shown === undefined) {
    return failure(context, "NO_TOOLTIP", "ArrowLeft's tab showed no tooltip.");
  }
  await context.driver.pressKeys([keys.escape]);
  if ((await displayIs(context, (display) => display === "none")) !== undefined) {
    return { passed: true };
  }
  return failure(context, "TOOLTIP_STAYED", `Escape left the tooltip (${shown}).`);
}

/**
 * Reads the tooltip's computed `display` until `wanted` holds, for at most {@link tooltipWaitMs};
 * a closed popover is `display: none`. Returns the display read, or undefined.
 */
async function displayIs(
  context: StepContext,
  wanted: (display: string) => boolean,
): Promise<string | undefined> {
  for (let waited = 0; waited <= tooltipWaitMs; waited += pollEveryMs) {
    const display = await context.driver.cssValue(tooltipXpath, "display").catch(() => "");
    if (wanted(display)) return display;
    await context.sleep(pollEveryMs);
  }
  return undefined;
}
