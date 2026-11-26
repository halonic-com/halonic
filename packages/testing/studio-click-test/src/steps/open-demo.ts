import type { StepContext, StepOutcome } from "../runner.ts";
import {
  clickOrWhyNot,
  clickPlaceWhenShown,
  clickWhenShown,
  lastWords,
  waitForText,
} from "../screen.ts";
import { keys } from "../webdriver.ts";
import { buttonLabels, closeSettingsLabel, errorCodeIn, screenText, words } from "../words.ts";

/** How long Studio may take to start its engine on a fresh profile (the WSL import included). */
export const startWaitMs = 5 * 60_000;

/**
 * Opens the demo from Welcome. Welcome keeps Open demo off until the engine
 * runs, so a click that lands is itself the first sign the engine started.
 */
export async function openDemo(context: StepContext): Promise<StepOutcome> {
  const { openDemo, trust } = buttonLabels;
  const whyNot = await clickOrWhyNot(context, openDemo.text, startWaitMs);
  if (whyNot !== undefined) {
    const { text } = await waitForText(context, 0, () => undefined);
    const seen = text === "" ? "" : ` Screen: ${lastWords(text)}`;
    return {
      passed: false,
      code: errorCodeIn(text) ?? "ENGINE_NOT_STARTED",
      note: `${openDemo.text} never turned on (last click: ${whyNot}).${seen}`,
    };
  }
  // The trust check shows only for a workspace with runnable files; no dialog is fine.
  await clickWhenShown(context, trust.text, 20_000);
  return { passed: true };
}

/**
 * Puts the main window on a workspace: a restarted app opens on Welcome
 * (run 45665141501), where Settings isn't, so a step after a restart opens
 * the demo again first.
 */
export async function onWorkspace(context: StepContext): Promise<StepOutcome> {
  await context.driver.switchToWindow(context.mainWindow);
  const { text } = await waitForText(context, 30_000, (read) =>
    read.trim() === "" ? undefined : read,
  );
  if (!text.includes(buttonLabels.openDemo.text)) return { passed: true };
  return openDemo(context);
}

/**
 * Puts the main window on a workspace with no Settings over it. Connect Paperclip leaves Settings
 * open on Connections, and that modal dialog keeps the switcher and the tabs strip from being
 * clicked (HAL-19005), so a step that needs them closes it first with its ×. No Settings is fine.
 */
export async function onWorkspaceWithoutSettings(context: StepContext): Promise<StepOutcome> {
  const workspace = await onWorkspace(context);
  if (!workspace.passed) return workspace;
  await clickWhenShown(context, closeSettingsLabel, 2_000);
  return { passed: true };
}

/**
 * Opens Settings › Connections from a workspace and returns whether Settings
 * opened. Settings is a row in the Places list, which the ☰ Places button
 * opens (run 45675354530), unless that list or Settings is open already.
 */
export async function openConnections(context: StepContext): Promise<boolean> {
  if (!(await openSettings(context))) return false;
  await clickWhenShown(context, words.connectionsSection, 10_000);
  return true;
}

/**
 * Opens a section of Settings, such as Appearance, by its row, and returns
 * whether the row was clicked. A Settings left open by an earlier step is
 * used as it is: the main window's Places button is behind it.
 */
export async function openSettingsSection(context: StepContext, row: string): Promise<boolean> {
  if (await clickWhenShown(context, row, 2_000)) return true;
  if (!(await openSettings(context))) return false;
  return clickWhenShown(context, row, 10_000);
}

async function openSettings(context: StepContext): Promise<boolean> {
  return openPlace(context, buttonLabels.settings.text);
}

/**
 * Opens a place, such as Inbox, from the Places list unless the list shows already. The place is
 * clicked inside the list, not anywhere on the page (HAL-19099).
 */
export async function openPlace(context: StepContext, name: string): Promise<boolean> {
  return (
    (await clickPlaceWhenShown(context, name, 2_000)) ||
    ((await clickWhenShown(context, screenText.places.text, 10_000)) &&
      (await clickPlaceWhenShown(context, name, 10_000)))
  );
}

/**
 * Closes the dialogs an earlier step left open, such as Settings after
 * Connect Paperclip, which cover the Places button (run 45700568549).
 */
export async function closeDialogs(context: StepContext): Promise<void> {
  for (let tries = 0; tries < 3; tries += 1) {
    const open = await context.driver.count(openDialog).catch(() => 0);
    if (open === 0) return;
    await context.driver.pressKeys([keys.escape]);
    await context.sleep(500);
  }
}

/** An open dialog: the kit's are native `<dialog>` elements, with no role unless an alert. */
export const openDialog = "//dialog[@open]";
