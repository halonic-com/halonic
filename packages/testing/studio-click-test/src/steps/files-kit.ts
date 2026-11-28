import type { Step, StepContext, StepOutcome } from "../runner.ts";
import {
  buttonNamed,
  clickXPathWhenShown,
  lastWords,
  pollEveryMs,
  tabNamed,
  waitForText,
  xpathString,
} from "../screen.ts";
import { keys } from "../webdriver.ts";
import { kitText } from "../words.ts";
import { filesTreeParts, sidebarSwitch, sidebarSwitchList } from "./files-tree-parts.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** How long a view, a menu, a toast or a dialog may take to show or go. */
const shownWaitMs = 10_000;

/** How long the file tree may take to list the demo's files. */
const treeWaitMs = 30_000;

/** A tab of the sidebar's switch, and only there. */
export function sidebarTab(name: string): string {
  return `${sidebarSwitchList}${tabNamed(name)}`;
}

/** The first file row of the sidebar's Files tree, inside the switch's own panel (step 35's parts). */
export const firstFileRow = `(${filesTreeParts.fileRows})[1]`;

const moreActions = `starts-with(@aria-label, ${xpathString(kitText.moreActions.text)})`;

/**
 * The ⋮ in the open file's header, a kit `Menu` (`file-header.tsx`). A tree row's ⋮ has the same
 * name but opens the tree's own context menu, and the rows come first in the page.
 */
export const fileMenuButton = `(//button[${moreActions} and not(ancestor::*[@role='tree'])])[1]`;

/** The kit menu its trigger's `id` names: the kit keeps every menu's popover in the page. */
export function menuOf(triggerId: string): string {
  return `//*[@role='menu' and @aria-labelledby=${xpathString(triggerId)}]`;
}

/** The toast region, a `section` named "Notifications" while it holds a toast. */
const toastRegion = `//section[@aria-label=${xpathString(kitText.notifications.text)}]`;

/** Whether a card holds the Copy path toast's words, so a toast an earlier step left up is not counted. */
const saysCopyPath = `(contains(., ${xpathString(kitText.pathCopied.text)}) or contains(., ${xpathString(kitText.pathNotCopied.text)}))`;

/**
 * The Copy path toast's card in the region: `role="alert"` for a danger toast, `role="status"`
 * for the rest.
 */
export const toastCard = `${toastRegion}//*[(@role='status' or @role='alert') and ${saysCopyPath}]`;

/** The Copy path toast's close button, named "Close" and the toast's title. */
export const toastClose = `(${toastCard}//button[starts-with(@aria-label, ${xpathString(kitText.closeToast.text)})])[1]`;

/** The New file dialog: the kit's Dialog is a native `<dialog>`, named by its `h2` title. */
export const newFileDialogXpath = `//dialog[@open][.//h2[normalize-space()=${xpathString(kitText.newFile.text)}]]`;

/**
 * The sidebar's Files view: a file opened from the tree has a ⋮ in its header, which opens the
 * kit's Menu with `aria-expanded="true"` on it, and Escape closes it again; its Copy path then
 * shows a toast, "Copied …" or, when the clipboard refused, "Couldn't copy the path.", and the
 * toast's close button removes it (HAL-20752).
 */
export const fileMenuToast: Step = {
  id: "file-menu-toast",
  title: "A file's menu opens and closes, and Copy path shows a toast",
  requirements: ["kit.menu", "kit.toast"],
  run: (context) => inFilesView(context, () => menuAndToast(context)),
};

/**
 * The sidebar's Files view: New file opens the kit's Dialog, a native `<dialog>` named "New file",
 * and Escape cancels it, so it closes (HAL-20752).
 */
export const newFileDialog: Step = {
  id: "new-file-dialog",
  title: "New file opens a dialog, and Escape closes it",
  requirements: ["kit.dialog"],
  run: (context) => inFilesView(context, () => opensDialog(context)),
};

/**
 * Runs `check` with the sidebar on its Files view, in a wide window where the sidebar is docked,
 * and gives the sidebar back to the places after, as it was before.
 */
function inFilesView(
  context: StepContext,
  check: () => Promise<StepOutcome>,
): Promise<StepOutcome> {
  return inWideWindow(context, async () => {
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    if (!(await clickXPathWhenShown(context, sidebarTab(sidebarSwitch.files.text), shownWaitMs))) {
      return failure(context, "NO_FILES_VIEW", "No Files in the sidebar's switch.");
    }
    const outcome = await check();
    await clickXPathWhenShown(context, sidebarTab(sidebarSwitch.studio.text), shownWaitMs);
    return outcome;
  });
}

async function menuAndToast(context: StepContext): Promise<StepOutcome> {
  if (!(await clickXPathWhenShown(context, firstFileRow, treeWaitMs))) {
    return failure(context, "NO_FILE_ROW", "The Files tree lists no file.");
  }
  if (!(await clickXPathWhenShown(context, fileMenuButton, shownWaitMs))) {
    return failure(context, "NO_FILE_MENU_BUTTON", "The open file's header has no ⋮.");
  }
  const menu = menuOf((await context.driver.attribute(fileMenuButton, "id")) ?? "");
  if (!(await menuIs(context, menu, true))) {
    return failure(context, "MENU_NOT_OPEN", "The ⋮ opened no menu with aria-expanded.");
  }
  await context.driver.pressKeys([keys.escape]);
  if (!(await menuIs(context, menu, false))) {
    return failure(context, "MENU_NOT_CLOSED", "Escape left the ⋮'s menu open.");
  }
  return copyPathToast(context, menu);
}

async function copyPathToast(context: StepContext, menu: string): Promise<StepOutcome> {
  const copyPath = `${menu}//*[@role='menuitem' and normalize-space()=${xpathString(kitText.copyPath.text)}]`;
  if (
    !(await clickXPathWhenShown(context, fileMenuButton, shownWaitMs)) ||
    !(await clickXPathWhenShown(context, copyPath, shownWaitMs))
  ) {
    return failure(context, "NO_COPY_PATH", "The file menu has no Copy path.");
  }
  const { pathCopied, pathNotCopied } = kitText;
  const said = await waitForText(context, shownWaitMs, (text) =>
    text.includes(pathCopied.text) || text.includes(pathNotCopied.text) ? true : undefined,
  );
  if (said.value === undefined || !(await waitForCount(context, toastCard, (count) => count > 0))) {
    return failure(context, "NO_TOAST", "Copy path showed no toast.");
  }
  if (!(await clickXPathWhenShown(context, toastClose, shownWaitMs))) {
    return failure(context, "NO_TOAST_CLOSE", "The toast has no close button.");
  }
  if (await waitForCount(context, toastCard, (count) => count === 0)) return { passed: true };
  return failure(context, "TOAST_STAYED", "The toast's close button left it shown.");
}

async function opensDialog(context: StepContext): Promise<StepOutcome> {
  if (!(await clickXPathWhenShown(context, buttonNamed(kitText.newFile.text), treeWaitMs))) {
    return failure(context, "NO_NEW_FILE", "No New file button in the Files view.");
  }
  if (!(await waitForCount(context, newFileDialogXpath, (count) => count === 1))) {
    return failure(context, "NO_DIALOG", "New file opened no dialog.");
  }
  await context.driver.pressKeys([keys.escape]);
  if (await waitForCount(context, newFileDialogXpath, (count) => count === 0)) {
    return { passed: true };
  }
  return failure(context, "DIALOG_STAYED", "Escape left the New file dialog open.");
}

/**
 * Reads the ⋮'s `aria-expanded` and its menu's computed `display` until both say `open`, for at
 * most {@link shownWaitMs}; a closed popover is `display: none`.
 */
async function menuIs(context: StepContext, menu: string, open: boolean): Promise<boolean> {
  for (let waited = 0; waited <= shownWaitMs; waited += pollEveryMs) {
    const expanded = await context.driver.attribute(fileMenuButton, "aria-expanded");
    const display = await context.driver.cssValue(menu, "display").catch(() => "");
    const shown = display !== "" && display !== "none";
    if (expanded === String(open) && shown === open) return true;
    await context.sleep(pollEveryMs);
  }
  return false;
}

/** Counts what `xpath` finds until `wanted` holds, for at most {@link shownWaitMs}. */
export async function waitForCount(
  context: StepContext,
  xpath: string,
  wanted: (count: number) => boolean,
): Promise<boolean> {
  for (let waited = 0; waited <= shownWaitMs; waited += pollEveryMs) {
    if (wanted(await context.driver.count(xpath).catch(() => 0))) return true;
    await context.sleep(pollEveryMs);
  }
  return false;
}

/** A failed outcome with the step's words and what the screen showed last. */
export async function failure(
  context: StepContext,
  code: string,
  said: string,
): Promise<StepOutcome> {
  const text = await context.driver.pageText().catch(() => "");
  return { passed: false, code, note: `${said} Screen: ${lastWords(text)}` };
}
