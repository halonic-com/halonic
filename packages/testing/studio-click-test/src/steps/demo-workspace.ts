import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { lastWords, missingParts, waitForText } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { basicsText } from "../words.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/**
 * The sidebar's workspace switcher, a button named "Workspace: *name*". The demo's name comes from
 * its `workspace.yaml`, not from the step, so the step finds the switcher by the start of its name.
 */
export const switcherXpath = `//button[starts-with(@aria-label, '${basicsText.switcher.text}')]`;

/**
 * Step 15: the demo Open demo made is the shown workspace. The window title names the page, the
 * workspace and Halonic; the switcher opens the workspace menu, whose Recent lists the demo's
 * folder with the Demo tag, then Open a folder…. It runs in a wide window, where the sidebar shows
 * the switcher.
 */
export const demoWorkspace: Step = {
  id: "demo-workspace",
  title: "The demo is the shown workspace, with the Demo tag in the workspace menu",
  requirements: [
    "workspace.try-sample",
    "studio.try-sample",
    "workspace.workspace-window",
    "workspace.workspace-menu",
    "workspace.menu-sample-tag",
    "workspace.recent-workspaces",
    "shell.window-title",
  ],
  run: (context) => inWideWindow(context, () => showsDemo(context)),
};

async function showsDemo(context: StepContext): Promise<StepOutcome> {
  const workspace = await onWorkspaceWithoutSettings(context);
  if (!workspace.passed) return workspace;
  const title = await windowTitleParts(context);
  if (title.parts.length !== 3 || title.parts[2] !== basicsText.appName.text) {
    return { passed: false, code: "WRONG_TITLE", note: `Window title: "${title.text}".` };
  }
  const menu = await openWorkspaceMenu(context);
  if (!menu.passed) return menu;
  const { recent, demoFolder, demoTag, openFolderRow } = basicsText;
  const wanted = [recent.text, demoFolder.text, demoTag.text, openFolderRow.text];
  const listed = await waitForText(context, 10_000, (text) =>
    wanted.every((part) => text.includes(part)) ? true : undefined,
  );
  await context.driver.pressKeys([keys.escape]);
  if (listed.value === true) return { passed: true };
  const missing = missingParts(wanted, listed.text);
  const note = `The workspace menu has no ${missing}. Screen: ${lastWords(listed.text)}`;
  return { passed: false, code: "MENU_INCOMPLETE", note };
}

/**
 * Opens the workspace menu from the sidebar's switcher, waiting until the window shows a workspace.
 * Fails as `NO_SWITCHER` when no switcher shows.
 */
export async function openWorkspaceMenu(context: StepContext): Promise<StepOutcome> {
  let whyNot: string | undefined = "never tried";
  for (let tries = 0; tries < 10 && whyNot !== undefined; tries += 1) {
    if (tries > 0) await context.sleep(2_000);
    whyNot = await context.driver.click(switcherXpath).then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
  }
  if (whyNot === undefined) return { passed: true };
  return { passed: false, code: "NO_SWITCHER", note: `No workspace switcher (${whyNot}).` };
}

/** The window title, read until it names a page, and its parts between the " · ". */
async function windowTitleParts(
  context: StepContext,
): Promise<{ text: string; parts: readonly string[] }> {
  let text = "";
  for (let tries = 0; tries < 5; tries += 1) {
    text = await context.driver.title();
    if (text.includes(basicsText.titleSeparator.text)) break;
    await context.sleep(2_000);
  }
  return { text, parts: text.split(basicsText.titleSeparator.text) };
}
