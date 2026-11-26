import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { lastWords, waitForText } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
import { errorCodeIn, words } from "../words.ts";
import { openAppWindow } from "./app-window.ts";
import { failure, showConnections } from "./connections.ts";
import { onWorkspace } from "./open-demo.ts";

/** How long the reopened demo gets to hand the saved key back to the agent host. */
const restoreWaitMs = 30_000;

/**
 * Step 6: after Halonic quits fully and starts again through its Start menu shortcut, the demo
 * still holds step 3's sign-in. Settings › Connections reads Connected without Sign in again,
 * and Halonic Messenger lists the seeded chat instead of No connections (HAL-18910).
 */
export const restartKeepsSignIn: Step = {
  id: "restart-keeps-sign-in",
  title: "A restart keeps the Paperclip sign-in",
  requirements: ["services.paperclip-restore", "connections.connection-row"],
  needs: ["connect-paperclip"],
  restartsFirst: true,
  run: async (context) => {
    // A restarted app is on Welcome; opening the demo is what starts the restore.
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    const connected = await stillConnected(context);
    if (!connected.passed) return connected;
    return messengerListsChat(context);
  },
};

/** Settings › Connections reads Connected once the restore ran, and never offers Sign in again. */
async function stillConnected(context: StepContext): Promise<StepOutcome> {
  if (!(await showConnections(context))) return failure("NO_SETTINGS", "Settings didn't open.", "");
  const row = await waitForText(context, restoreWaitMs, (text) =>
    text.includes(words.connected) && !text.includes(words.signInAgain) ? true : undefined,
  );
  if (row.value === true) return { passed: true };
  if (row.text.includes(words.signInAgain)) {
    return failure(
      "SIGN_IN_AGAIN_SHOWN",
      `After the restart the row offers ${words.signInAgain}.`,
      row.text,
    );
  }
  const code = errorCodeIn(row.text) ?? "NOT_CONNECTED";
  return failure(code, `After the restart the row doesn't read ${words.connected}.`, row.text);
}

/** Halonic Messenger, opened from the Start menu, lists the seeded chat. */
async function messengerListsChat(context: StepContext): Promise<StepOutcome> {
  const window = await openAppWindow(context, "Halonic Messenger", (text) =>
    text.includes(seedNames.agent),
  );
  if (window.opened) return { passed: true };
  const { title, line } = words.messengerEmpty;
  const empty = window.text.includes(title) && window.text.includes(line);
  return {
    passed: false,
    code: empty ? "NO_CONNECTIONS" : "NO_CHAT",
    note: `Messenger: ${lastWords(window.text) || "(no window)"}`,
  };
}
