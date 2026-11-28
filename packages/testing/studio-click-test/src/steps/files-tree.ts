import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickXPathWhenShown, lastWords, pollEveryMs, tabNamed, waitForText } from "../screen.ts";
import { keys } from "../webdriver.ts";
import {
  countWords,
  filesTreeParts as parts,
  sidebarSwitch,
  sidebarSwitchList,
} from "./files-tree-parts.ts";
import { rowsLook } from "./files-tree-rows.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** How long the tree may take to list the demo's files. */
const treeWaitMs = 30_000;

/** How long the tree may take to follow the search field. */
const searchWaitMs = 10_000;

/**
 * What the step types, both found in the demo: a file's name, then a folder with its slash, which
 * shows every file in that folder (`files.ui.tree-search`). In a fresh demo they match 1 file
 * and 3.
 */
export const filesSearches = ["writer", "agents/"] as const;

/**
 * Step 35 (HAL-20764): the file tree's search and rows. It switches the sidebar to Files, types in
 * "Search files" and reads the count under the field against the file rows the tree shows, reads
 * how a row is drawn while the search holds the folders open, and presses Escape, which must show
 * the whole tree again. It runs in a wide window, where the sidebar is docked and Escape can't be
 * taken for closing the Places drawer, and it gives the sidebar back to the places at the end.
 */
export const filesTreeSearch: Step = {
  id: "files-tree-search",
  title: "The file tree's search counts its files, and Escape shows the whole tree again",
  requirements: ["files.ui.tree-search", "files.ui.tree-rows"],
  run: (context) => inWideWindow(context, () => searchesTheTree(context)),
};

async function searchesTheTree(context: StepContext): Promise<StepOutcome> {
  const workspace = await onWorkspaceWithoutSettings(context);
  if (!workspace.passed) return workspace;
  if (!(await showSidebarView(context, sidebarSwitch.files.text))) {
    return { passed: false, code: "NO_FILES_VIEW", note: await screenNote(context) };
  }
  const outcome = await checkTree(context);
  // The steps of a later run look for the places, so the sidebar goes back to them.
  const back = await showSidebarView(context, sidebarSwitch.studio.text);
  if (!outcome.passed || back) return outcome;
  const note = `The sidebar's switch didn't go back to ${sidebarSwitch.studio.text}.`;
  return { passed: false, code: "SIDEBAR_NOT_RESTORED", note };
}

/** Picks a tab of the sidebar's Studio | Files switch, and only there. */
function showSidebarView(context: StepContext, name: string): Promise<boolean> {
  return clickXPathWhenShown(context, `${sidebarSwitchList}${tabNamed(name)}`, searchWaitMs);
}

async function checkTree(context: StepContext): Promise<StepOutcome> {
  const whole = await waitForCount(context, parts.rows, treeWaitMs, (count) => count > 0);
  if (whole === 0 || (await context.driver.count(parts.search)) === 0) {
    return { passed: false, code: "NO_FILE_TREE", note: await screenNote(context) };
  }
  const [name, folder] = filesSearches;
  const checks = [
    () => searchShows(context, name),
    () => rowsLook(context),
    () => escapeShowsTree(context, whole),
    () => searchShows(context, folder),
    () => escapeShowsTree(context, whole),
  ];
  for (const check of checks) {
    const outcome = await check();
    if (!outcome.passed) return outcome;
  }
  return { passed: true };
}

/**
 * Types `text` in the search field and reads what the tree shows for it: a count line, only file
 * rows with `text` in their path, and the count line saying how many those are.
 */
async function searchShows(context: StepContext, text: string): Promise<StepOutcome> {
  const { driver } = context;
  await driver.type(parts.search, text);
  const lines = await waitForCount(context, parts.statusLines, searchWaitMs, (count) => count > 0);
  if (lines === 0) {
    const note = `"${text}": no count under the search field.`;
    return { passed: false, code: "NO_SEARCH_COUNT", note };
  }
  const shown = await driver.count(parts.fileRows);
  const holding = await driver.count(parts.fileRowsHolding(text));
  if (shown === 0 || holding !== shown) {
    const note = `"${text}": the tree shows ${shown} file rows, ${holding} with it in their path.`;
    return { passed: false, code: "SEARCH_SHOWS_OTHER_FILES", note };
  }
  if ((await driver.count(parts.countLine(shown))) > 0) return { passed: true };
  const note = `"${text}": the tree shows ${shown} file rows, but the line under the field doesn't read "${countWords(shown)}".`;
  return { passed: false, code: "SEARCH_COUNT_WRONG", note };
}

/**
 * Presses Escape in the search field, which the typing left focused, and reads the tree: no count
 * line, and as many rows as before the search, the folders as they were.
 */
async function escapeShowsTree(context: StepContext, whole: number): Promise<StepOutcome> {
  await context.driver.pressKeys([keys.escape]);
  const lines = await waitForCount(
    context,
    parts.statusLines,
    searchWaitMs,
    (count) => count === 0,
  );
  if (lines > 0) {
    const note = "After Escape the search field still shows its count.";
    return { passed: false, code: "SEARCH_NOT_CLEARED", note };
  }
  const rows = await context.driver.count(parts.rows);
  if (rows === whole) return { passed: true };
  const note = `After Escape the tree shows ${rows} rows, not the ${whole} it showed before the search.`;
  return { passed: false, code: "TREE_NOT_BACK", note };
}

/** Counts what `xpath` finds until `enough` says so, for at most `waitMs`; returns the last. */
async function waitForCount(
  context: StepContext,
  xpath: string,
  waitMs: number,
  enough: (count: number) => boolean,
): Promise<number> {
  let count = await context.driver.count(xpath);
  const reads = Math.max(1, Math.ceil(waitMs / pollEveryMs));
  for (let read = 1; read < reads && !enough(count); read += 1) {
    await context.sleep(pollEveryMs);
    count = await context.driver.count(xpath);
  }
  return count;
}

async function screenNote(context: StepContext): Promise<string> {
  const { text } = await waitForText(context, 0, () => undefined);
  return lastWords(text);
}
