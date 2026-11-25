import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { buttonNamed, clickWhenShown, waitForText } from "../screen.ts";
import { errorCodeIn, words } from "../words.ts";
import { clickXPath, failure, rowDisconnect, showConnections } from "./connections.ts";
import { onWorkspace } from "./open-demo.ts";

const signedInWaitMs = 60_000;

/** How many connection rows the text shows: each row ends with what its key can do. */
export function rowCount(text: string): number {
  return text.split(words.keyPower).length - 1;
}

/** The rows the text shows, and how many of them are signed out, for the step's note. */
export function listSummary(text: string): string {
  return `${rowCount(text)} rows, ${signedOutCount(text)} signed out`;
}

/**
 * How many rows are signed out: each shows the signed-out callout once. Not Sign in again,
 * which that callout's text and its button both say (run 45715326517).
 */
function signedOutCount(text: string): number {
  return text.split(words.signedOutCallout).length - 1;
}

/**
 * Step 13: the connected row's Add another account opens its dialog with the
 * Paperclip's address filled in; Continue, approved on the test Paperclip,
 * lists a second connection. The step then disconnects that second one, which
 * stays listed as Signed out, so step 3's is the only connected one again.
 */
export const addAccount: Step = {
  id: "add-account",
  title: "Add another account lists a second connection",
  requirements: ["connections.add-account", "agent-host.paperclip-add-account"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    if (!(await showConnections(context)))
      return failure("NO_SETTINGS", "Settings didn't open.", "");
    const dialog = await openAddAccount(context);
    if (!dialog.passed) return dialog;
    const signedIn = await signInAnother(context);
    if (!signedIn.passed) return signedIn;
    const disconnected = await disconnectSecond(context);
    // Both lists go in the note, so a row that changed state on the way shows in the table.
    const note = [signedIn.note, disconnected.note].filter((part) => part !== undefined).join(" ");
    return { ...disconnected, note };
  },
};

async function openAddAccount(context: StepContext): Promise<StepOutcome> {
  if (!(await clickWhenShown(context, words.addAccount, 20_000))) {
    const { text } = await waitForText(context, 0, () => undefined);
    return failure("NO_ADD_ACCOUNT", `No ${words.addAccount} on the connected row.`, text);
  }
  const shown = await waitForText(context, 10_000, (text) =>
    text.includes(words.addAccountLead) ? true : undefined,
  );
  if (shown.value === undefined) {
    return failure("NO_ADD_ACCOUNT_DIALOG", `No "${words.addAccountLead}".`, shown.text);
  }
  return { passed: true };
}

async function signInAnother(context: StepContext): Promise<StepOutcome> {
  if (!(await clickWhenShown(context, words.continueLabel, 10_000))) {
    return failure("NO_CONTINUE", "Continue stayed off for the filled-in address.", "");
  }
  // The approval page's link shows once the engine started the sign-in, so its challenge exists.
  const waiting = await waitForText(context, 30_000, (text) =>
    text.includes(words.openApproval) ? "waiting" : errorCodeIn(text),
  );
  if (waiting.value !== "waiting") {
    return failure(waiting.value ?? "NO_SIGN_IN", "No sign-in started.", waiting.text);
  }
  const refused = await context.approveSignIn();
  if (refused !== undefined) return { passed: false, code: "NOT_APPROVED", note: refused };
  const listed = await waitForText(context, signedInWaitMs, (text) =>
    rowCount(text) >= 2 && !text.includes(words.openApproval) ? true : undefined,
  );
  if (listed.value === true) return { passed: true, note: `Listed: ${listSummary(listed.text)}.` };
  return failure("NO_SECOND_ACCOUNT", "Settings › Connections lists one connection.", listed.text);
}

async function disconnectSecond(context: StepContext): Promise<StepOutcome> {
  // The kit's dialogs are native <dialog>s, and the confirmation opens inside Settings' own,
  // so its Disconnect is the one in the innermost open dialog (run 45709139341).
  const confirm = `//dialog[@open][not(.//dialog[@open])]${buttonNamed(words.disconnect)}`;
  for (const button of [rowDisconnect(2), confirm]) {
    if (!(await clickXPath(context, button, 5))) {
      return failure("NO_DISCONNECT", `Couldn't click ${button}.`, "");
    }
  }
  // Disconnect forgets the key and the cache but keeps the workspace's connection file, so the
  // row stays, signed out (agent host's `connections()`; run 45712189624).
  const gone = await waitForText(context, 30_000, (text) =>
    rowCount(text) === 2 && signedOutCount(text) === 1 && text.includes(words.keyRevoked)
      ? true
      : undefined,
  );
  const after = `After Disconnect: ${listSummary(gone.text)}.`;
  if (gone.value === true) return { passed: true, note: after };
  return failure("NOT_DISCONNECTED", `The second connection didn't sign out. ${after}`, gone.text);
}
