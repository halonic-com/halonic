import type { Step } from "../runner.ts";
import { buttonNamed, lastWords, waitForText } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
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
      const window = await openAppWindow(context, name, (text) => text.includes(shows), onlyNew);
      if (!window.opened) {
        const note = `${name} opened no window showing ${shows}. Last: ${lastWords(window.text)}`;
        return { passed: false, code: "NO_WINDOW", note };
      }
    }
    return { passed: true };
  },
};

/**
 * Step 14: Settings › Connections › Disconnect, confirmed, says the key is
 * revoked, and the test Paperclip refuses the key Studio signed in with.
 */
export const disconnect: Step = {
  id: "disconnect",
  title: "Disconnect revokes the key on Paperclip",
  requirements: ["services.paperclip-disconnect"],
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
