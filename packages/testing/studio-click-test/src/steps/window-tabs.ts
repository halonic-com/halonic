import type { Step, StepContext } from "../runner.ts";
import { clickWhenShown, pollEveryMs } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { basicsText, buttonLabels } from "../words.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";

/** Every tab in the title bar's strip. */
export const tabXpath = `//*[@role='tablist' and @aria-label='${basicsText.openTabs.text}']//*[@role='tab']`;

const tabWaitMs = 10_000;

/**
 * Step 16: the window tabs. **+** (New tab) adds a tab, Ctrl W closes the active one and
 * Ctrl Shift T brings it back, each counted in the Open tabs strip. **+** also opens Ctrl K over
 * the new tab, a modal dialog that keeps the window keys off, so Esc closes it first.
 */
export const windowTabs: Step = {
  id: "window-tabs",
  title: "New tab, Ctrl W and Ctrl Shift T in the Open tabs strip",
  requirements: ["shell.window-tab-strip", "shell.tab-set", "shell.window-keys"],
  run: async (context) => {
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    const before = await context.driver.count(tabXpath);
    if (before === 0) return { passed: false, code: "NO_TABS", note: "No Open tabs strip." };
    if (!(await clickWhenShown(context, buttonLabels.newTab.text, tabWaitMs))) {
      return { passed: false, code: "NO_NEW_TAB_BUTTON", note: "No New tab button." };
    }
    const opened = await waitForTabs(context, before + 1);
    if (opened !== before + 1) return tabsFailure("TAB_NOT_OPENED", "New tab", before, opened);
    await context.driver.pressKeys([keys.escape]);
    await context.driver.pressKeys([keys.control, "w"]);
    const closed = await waitForTabs(context, before);
    if (closed !== before) return tabsFailure("TAB_NOT_CLOSED", "Ctrl W", opened, closed);
    await context.driver.pressKeys([keys.control, keys.shift, "t"]);
    const reopened = await waitForTabs(context, before + 1);
    if (reopened !== before + 1) {
      return tabsFailure("TAB_NOT_REOPENED", "Ctrl Shift T", closed, reopened);
    }
    // Leaves the window with the tabs it had, for the steps after this one.
    await context.driver.pressKeys([keys.control, "w"]);
    return { passed: true };
  },
};

/** Counts the tabs until there are `wanted`, for at most {@link tabWaitMs}, and returns the last count. */
async function waitForTabs(context: StepContext, wanted: number): Promise<number> {
  let count = await context.driver.count(tabXpath);
  for (let waited = 0; count !== wanted && waited < tabWaitMs; waited += pollEveryMs) {
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
