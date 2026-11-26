import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickWhenShown, pollEveryMs } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { basicsText, buttonLabels } from "../words.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** Every tab in the title bar's strip. */
export const tabXpath = `//*[@role='tablist' and @aria-label='${basicsText.openTabs.text}']//*[@role='tab']`;

const tabWaitMs = 10_000;

/**
 * Step 15: the window tabs. **+** (New tab) adds a tab, Ctrl W closes the active one and
 * Ctrl Shift T brings it back, each counted in the Open tabs strip. **+** also opens Ctrl K over
 * the new tab, a modal dialog that keeps the window keys off, so Esc closes it first. It runs in
 * a wide window: a narrow one folds the strip into "1 open tab ▾".
 */
export const windowTabs: Step = {
  id: "window-tabs",
  title: "New tab, Ctrl W and Ctrl Shift T in the Open tabs strip",
  requirements: ["shell.window-tab-strip", "shell.tab-set", "shell.window-keys"],
  run: (context) => inWideWindow(context, () => opensAndClosesTabs(context)),
};

async function opensAndClosesTabs(context: StepContext): Promise<StepOutcome> {
  const workspace = await onWorkspaceWithoutSettings(context);
  if (!workspace.passed) return workspace;
  // The strip shows once the widened window has laid out again.
  const before = await waitForTabs(context, (count) => count > 0);
  if (before === 0) return { passed: false, code: "NO_TABS", note: "No Open tabs strip." };
  if (!(await clickWhenShown(context, buttonLabels.newTab.text, tabWaitMs))) {
    return { passed: false, code: "NO_NEW_TAB_BUTTON", note: "No New tab button." };
  }
  const opened = await waitForTabs(context, (count) => count === before + 1);
  if (opened !== before + 1) return tabsFailure("TAB_NOT_OPENED", "New tab", before, opened);
  await context.driver.pressKeys([keys.escape]);
  await context.driver.pressKeys([keys.control, "w"]);
  const closed = await waitForTabs(context, (count) => count === before);
  if (closed !== before) return tabsFailure("TAB_NOT_CLOSED", "Ctrl W", opened, closed);
  await context.driver.pressKeys([keys.control, keys.shift, "t"]);
  const reopened = await waitForTabs(context, (count) => count === before + 1);
  if (reopened !== before + 1) {
    return tabsFailure("TAB_NOT_REOPENED", "Ctrl Shift T", closed, reopened);
  }
  // Leaves the window with the tabs it had, for the steps after this one.
  await context.driver.pressKeys([keys.control, "w"]);
  return { passed: true };
}

/** Counts the tabs until the count is `wanted`, for at most {@link tabWaitMs}, and returns the last count. */
async function waitForTabs(
  context: StepContext,
  wanted: (count: number) => boolean,
): Promise<number> {
  let count = await context.driver.count(tabXpath);
  for (let waited = 0; !wanted(count) && waited < tabWaitMs; waited += pollEveryMs) {
    await context.sleep(pollEveryMs);
    count = await context.driver.count(tabXpath);
  }
  return count;
}

function tabsFailure(code: string, action: string, before: number, after: number) {
  return {
    passed: false,
    code,
    note: `${action}: ${before} tabs before, ${after} after.`,
  } as const;
}
