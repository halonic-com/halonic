import type { Step } from "../runner.ts";
import { clickWhenShown, lastWords, waitForText } from "../screen.ts";
import { errorCodeIn, words } from "../words.ts";
import { onWorkspace, openConnections } from "./open-demo.ts";

const connectedWaitMs = 60_000;

/**
 * Step 3: Settings › Connections › Connect Paperclip with the throwaway
 * Paperclip's address, approved there as its board, until the row says
 * Connected.
 */
export const connectPaperclip: Step = {
  id: "connect-paperclip",
  title: "Settings › Connections › Connect Paperclip, approve, Connected",
  requirements: [
    "studio.desktop-connections",
    "connections.connect-dialog",
    "connections.connection-row",
    "studio.src-tauri.paperclip-key-keep",
  ],
  run: async (context) => {
    const { driver } = context;
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    const settingsOpened = await openConnections(context);
    const section = await waitForText(context, 20_000, (text) =>
      text.includes(words.connect) || errorCodeIn(text) !== undefined ? text : undefined,
    );
    const listError = errorCodeIn(section.text);
    if (listError !== undefined)
      return { passed: false, code: listError, note: lastWords(section.text) };
    if (!settingsOpened)
      return { passed: false, code: "NO_SETTINGS", note: lastWords(section.text) };
    if (!(await clickWhenShown(context, words.connect, 10_000))) {
      return { passed: false, code: "NO_CONNECT_BUTTON", note: lastWords(section.text) };
    }
    await driver.type(`//input[@placeholder='${words.addressPlaceholder}']`, context.paperclipUrl);
    if (!(await clickWhenShown(context, words.continueLabel, 10_000))) {
      return {
        passed: false,
        code: "NO_CONTINUE",
        note: "Continue stayed off for the test Paperclip's address.",
      };
    }
    const refused = await context.approveSignIn();
    if (refused !== undefined) return { passed: false, code: "NOT_APPROVED", note: refused };
    const connected = await waitForText(context, connectedWaitMs, (text) =>
      text.includes(words.connected) ? true : undefined,
    );
    if (connected.value === true) return { passed: true };
    const code = errorCodeIn(connected.text) ?? "NOT_CONNECTED";
    return { passed: false, code, note: lastWords(connected.text) };
  },
};
