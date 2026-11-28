import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { buttonNamed, lastWords, waitForText } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
import type { KeyboardFocus } from "../top-level-windows.ts";
import { screenText, words } from "../words.ts";
import { openAppWindow } from "./app-window.ts";
import { closeDialogs, onWorkspace, openConnections, openDialog } from "./open-demo.ts";

/**
 * Step 13: with Halonic running, the Start menu's Halonic Inbox and Halonic
 * Messenger shortcuts each show their window. The single-instance plugin
 * hands the second start's arguments to the running app, so the windows show
 * up in this session. No step opened the Inbox window before, so it must be a
 * new one, showing Needs you empty after step 9's answer; Messenger's, open
 * since step 9, must show the seeded chat. The test never closes the app's
 * windows: WebDriver's close left a shortcut with no window (run 45730163649).
 * Each page must sit in its app's frame (HAL-20480): one top-level window of
 * `<shortcut>.exe`, no new top-level window of Halonic.exe, and a second start
 * of the shortcut opens no second frame.
 */
export const startMenuShortcuts: Step = {
  id: "start-menu-shortcuts",
  title: "Start menu: Halonic Inbox and Halonic Messenger open their windows",
  requirements: ["studio.installer-focused-apps", "studio.focused-app-window"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    const shortcuts = [
      { name: "Halonic Inbox", shows: screenText.nothingWaiting.text, onlyNew: true },
      { name: "Halonic Messenger", shows: seedNames.agent, onlyNew: false },
    ];
    for (const { name, shows, onlyNew } of shortcuts) {
      const halonicWindows = (await context.topLevelWindows(halonicExe)).length;
      const window = await openAppWindow(context, name, (text) => text.includes(shows), onlyNew);
      if (!window.opened) {
        const note = `${name} opened no window showing ${shows}. Last: ${lastWords(window.text)}`;
        return { passed: false, code: "NO_WINDOW", note };
      }
      const frame = await inItsFrame(context, name, halonicWindows);
      if (!frame.passed) return frame;
    }
    return { passed: true };
  },
};

const halonicExe = "Halonic.exe";
/** How long a second start gets to open a second window, if it wrongly would. */
const secondStartWaitMs = 5_000;
/** How long the page in a frame that just started gets to take the keyboard focus. */
const focusWaitMs = 3_000;
const focusPollMs = 250;

/**
 * Where typing goes once the page in `frameExe` has the keyboard focus, or after
 * {@link focusWaitMs}: the frame shares its input queue with Halonic's page (HAL-20468),
 * so a person typing as soon as the window shows must reach the page.
 */
async function focusInPage(context: StepContext, frameExe: string): Promise<KeyboardFocus> {
  let typing = await context.keyboardFocus();
  for (let waited = 0; waited < focusWaitMs; waited += focusPollMs) {
    if (typing.image === frameExe && typing.focus === "page") return typing;
    await context.sleep(focusPollMs);
    typing = await context.keyboardFocus();
  }
  return typing;
}

/**
 * Checks that the page `shortcut` showed is in its frame: exactly one top-level window of
 * `<shortcut>.exe`, as many top-level windows of Halonic.exe as before, and still one frame
 * after the shortcut starts again.
 */
async function inItsFrame(
  context: StepContext,
  shortcut: string,
  halonicWindowsBefore: number,
): Promise<StepOutcome> {
  const frameExe = `${shortcut}.exe`;
  const frames = await context.topLevelWindows(frameExe);
  if (frames.length !== 1) {
    const note = `${frames.length} top-level windows of ${frameExe}, not 1.`;
    return { passed: false, code: "NO_FRAME", note };
  }
  const halonicWindows = (await context.topLevelWindows(halonicExe)).length;
  if (halonicWindows > halonicWindowsBefore) {
    const note = `${shortcut} opened a top-level window of ${halonicExe}, not one in ${frameExe}.`;
    return { passed: false, code: "NOT_IN_FRAME", note };
  }
  const typing = await focusInPage(context, frameExe);
  if (typing.image !== frameExe || typing.focus !== "page") {
    const where = typing.image === "" ? "no window" : `${typing.image} (${typing.focus})`;
    const note = `Right after ${shortcut} started, typing went to ${where}, not its page in ${frameExe}.`;
    return { passed: false, code: "NO_FOCUS", note };
  }
  await context.openShortcut(shortcut);
  await context.sleep(secondStartWaitMs);
  const again = await context.topLevelWindows(frameExe);
  if (again.length !== 1) {
    const note = `A second start of ${shortcut} left ${again.length} top-level windows of ${frameExe}.`;
    return { passed: false, code: "SECOND_FRAME", note };
  }
  return { passed: true };
}

/**
 * Step 14: Settings › Connections › Disconnect, confirmed, says the key is
 * revoked, and the test Paperclip refuses the key Studio signed in with.
 */
export const disconnect: Step = {
  id: "disconnect",
  title: "Disconnect revokes the key on Paperclip",
  requirements: ["studio.src-tauri.paperclip-key-keep"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    await closeDialogs(context);
    if (!(await openConnections(context))) {
      return { passed: false, code: "NO_SETTINGS", note: "Settings didn't open." };
    }
    // The row's button and the confirm's share the label, so the second click looks in the
    // newest open dialog: Settings is a dialog too (run 45700568549).
    const row = `(${buttonNamed(words.disconnect)})[1]`;
    const confirm = `(${openDialog})[last()]${buttonNamed(words.disconnect)}`;
    for (const button of [row, confirm]) {
      const clicked = await clickWithin(context, button);
      if (!clicked) return { passed: false, code: "NO_DISCONNECT", note: `No ${button}.` };
    }
    const said = await waitForText(context, 30_000, (text) =>
      text.includes(words.keyRevoked) ? true : undefined,
    );
    const works = await context.paperclip.studioKeyWorks();
    if (works !== false) {
      const why = works === undefined ? "Studio sent no key" : "the key still works";
      return { passed: false, code: "KEY_NOT_REVOKED", note: `Paperclip: ${why}.` };
    }
    if (said.value !== true) {
      return { passed: false, code: "NO_REVOKED_LINE", note: lastWords(said.text) };
    }
    return { passed: true };
  },
};

async function clickWithin(context: Parameters<Step["run"]>[0], xpath: string): Promise<boolean> {
  for (let tries = 0; tries < 5; tries += 1) {
    const clicked = await context.driver.click(xpath).then(
      () => true,
      () => false,
    );
    if (clicked) return true;
    await context.sleep(2_000);
  }
  return false;
}
