import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { buttonNamed, clickWhenShown, lastWords, waitForText } from "../screen.ts";
import { errorCodeIn, screenText, words } from "../words.ts";
import { onWorkspace, openConnections } from "./open-demo.ts";

/** The W3C key value for Escape, which closes Settings or a menu left open by an earlier step. */
const escapeKey = "\uE00C";
/** A test address that is neither https nor on this computer. */
export const plainHttpAddress = "http://paperclip.acme.test";
/** A connection's label once its user is known: "Paperclip · Halonic · Board Supervisor". */
const labelWithUser = /Paperclip · [^·\n]+ · [^·\n]+/;

/** The account switcher's trigger, named "Account menu, <the account's name>". */
export const switcherTrigger = `//button[starts-with(@aria-label, '${words.switcher.trigger("")}')]`;

/** A menu row with exactly this text. */
export function menuRowNamed(text: string): string {
  return `//*[(@role='menuitem' or @role='menuitemradio') and normalize-space()='${text}']`;
}

/**
 * Step 10: the account switcher at the sidebar's bottom left opens a menu with
 * its lead and Settings › Connections, which opens the Connections section with
 * the connected row. The sidebar may sit behind ☰ Places on a narrow window.
 */
export const accountSwitcher: Step = {
  id: "account-switcher",
  title: "The account switcher opens Settings › Connections",
  requirements: ["connections.account-switcher"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    await context.driver.pressKeys([escapeKey]);
    const opened =
      (await clickXPath(context, switcherTrigger, 3)) ||
      ((await clickWhenShown(context, screenText.places.text, 10_000)) &&
        (await clickXPath(context, switcherTrigger, 5)));
    if (!opened) return failure("NO_SWITCHER", "No account switcher in the sidebar.", "");
    const { lead, settings } = words.switcher;
    const menu = await waitForText(context, 10_000, (text) =>
      text.includes(lead) && text.includes(settings) ? true : undefined,
    );
    if (menu.value === undefined) return failure("NO_MENU", `No "${lead}" menu.`, menu.text);
    if (!(await clickXPath(context, menuRowNamed(settings), 5))) {
      return failure("NO_SETTINGS_ROW", `Couldn't click ${settings}.`, menu.text);
    }
    return rowShown(context);
  },
};

/**
 * Step 11: Settings › Connections shows the connection as a read-only,
 * connected row, named after the user it is signed in as, with what its key
 * can do and without Sign in again.
 */
export const connectionRow: Step = {
  id: "connection-row",
  title: "Settings › Connections shows the row and who it's signed in as",
  requirements: [
    "connections.connection-row",
    "connections.connection-user",
    "agent-host.paperclip-signed-in-user",
  ],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    if (!(await showConnections(context)))
      return failure("NO_SETTINGS", "Settings didn't open.", "");
    const row = await rowShown(context);
    if (!row.passed) return row;
    const { text } = await waitForText(context, 0, () => undefined);
    const missing = [words.readOnly, words.connected].filter((part) => !text.includes(part));
    if (missing.length > 0) return failure("NOT_CONNECTED", `No ${missing.join(", ")}.`, text);
    if (text.includes(words.signInAgain)) {
      return failure("SIGN_IN_AGAIN_SHOWN", `A connected row offers ${words.signInAgain}.`, text);
    }
    if (!labelWithUser.test(text)) {
      return failure("NO_USER_NAME", "The row's label doesn't name the signed-in user.", text);
    }
    return { passed: true, note: labelWithUser.exec(text)?.[0] ?? "" };
  },
};

/**
 * Step 12: the Connect dialog refuses a plain http address that isn't on this
 * computer, on the field, and closes again with its close button.
 */
export const httpsOnly: Step = {
  id: "connect-https-only",
  title: "Connect Paperclip refuses a plain http address",
  requirements: ["connections.connect-dialog"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    if (!(await showConnections(context)))
      return failure("NO_SETTINGS", "Settings didn't open.", "");
    if (!(await clickWhenShown(context, words.connect, 20_000))) {
      return failure("NO_CONNECT_BUTTON", `No ${words.connect}.`, "");
    }
    await context.driver.type(
      `//input[@placeholder='${words.addressPlaceholder}']`,
      plainHttpAddress,
    );
    if (!(await clickWhenShown(context, words.continueLabel, 10_000))) {
      return failure("NO_CONTINUE", `No ${words.continueLabel}.`, "");
    }
    const refused = await waitForText(context, 10_000, (text) =>
      text.includes(words.httpsOnly) ? true : undefined,
    );
    if (refused.value === undefined) {
      return failure("NOT_REFUSED", `No "${words.httpsOnly}".`, refused.text);
    }
    if (!(await clickWhenShown(context, `Close ${words.connect}`, 10_000))) {
      return failure("DIALOG_STAYED", "The Connect dialog didn't close.", refused.text);
    }
    return { passed: true };
  },
};

/**
 * Opens Settings › Connections, or only picks its section when an earlier
 * step left the Settings dialog open: then neither Places nor Settings is
 * there to click (run 45705906639).
 */
export async function showConnections(context: StepContext): Promise<boolean> {
  if (await clickWhenShown(context, words.connectionsSection, 2_000)) return true;
  return openConnections(context);
}

/** Waits for Settings › Connections to show at least one connection's row. */
async function rowShown(context: StepContext): Promise<StepOutcome> {
  const row = await waitForText(context, 20_000, (text) =>
    text.includes(words.keyPower) ? "row" : errorCodeIn(text),
  );
  if (row.value === "row") return { passed: true };
  return failure(row.value ?? "NO_ROW", `No row with "${words.keyPower}".`, row.text);
}

/** Clicks the first element the XPath finds, trying a few times, two seconds apart. */
export async function clickXPath(
  context: StepContext,
  xpath: string,
  tries: number,
): Promise<boolean> {
  for (let tried = 0; tried < tries; tried += 1) {
    const clicked = await context.driver.click(xpath).then(
      () => true,
      () => false,
    );
    if (clicked) return true;
    await context.sleep(2_000);
  }
  return false;
}

/** The row for a step that failed, with the end of what the screen showed. */
export function failure(code: string, note: string, text: string): StepOutcome {
  const seen = text === "" ? "" : ` Screen: ${lastWords(text)}`;
  return { passed: false, code, note: `${note}${seen}` };
}

/** The Disconnect button of the row at `position` (1 is the first), outside any confirmation. */
export function rowDisconnect(position: number): string {
  return `(${buttonNamed(words.disconnect)})[${position}]`;
}
