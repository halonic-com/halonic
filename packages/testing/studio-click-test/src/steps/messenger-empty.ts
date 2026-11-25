import type { Step, StepContext } from "../runner.ts";
import { lastWords, waitForText } from "../screen.ts";
import { errorCodeIn, words } from "../words.ts";
import { onWorkspace, openConnections } from "./open-demo.ts";

const windowWaitMs = 30_000;
const emptyStateWaitMs = 45_000;

/**
 * Step 2: Start menu › Halonic Messenger opens the Messenger, which shows its
 * empty state, No connections. Anything else fails. Messenger only logs a
 * failed read, so the step then opens Settings › Connections in the main
 * window, where the same failure has a line, and reports that line's code.
 */
export const messengerEmpty: Step = {
  id: "messenger-empty",
  title: "Messenger shows its empty state",
  requirements: [
    "studio.installer-focused-apps",
    "studio.focused-app-window",
    "messenger.not-connected",
  ],
  run: async (context) => {
    const before = await context.driver.windowHandles();
    await context.openShortcut("Halonic Messenger");
    const handle = await newWindow(context, before);
    if (handle === undefined) {
      return { passed: false, code: "NO_WINDOW", note: "Halonic Messenger opened no window." };
    }
    await context.driver.switchToWindow(handle);
    const { title, line } = words.messengerEmpty;
    const empty = await waitForText(context, emptyStateWaitMs, (text) =>
      text.includes(title) && text.includes(line) ? true : undefined,
    );
    if (empty.value === true) return { passed: true };
    const screen = `Messenger: ${lastWords(empty.text) || "(blank)"}`;
    const code =
      errorCodeIn(empty.text) ?? (await connectionsError(context)) ?? "EMPTY_STATE_MISSING";
    return { passed: false, code, note: screen };
  },
};

async function newWindow(
  context: StepContext,
  before: readonly string[],
): Promise<string | undefined> {
  const found = await waitForTrue(context, async () => {
    const handles = await context.driver.windowHandles();
    return handles.find((handle) => !before.includes(handle));
  });
  return found;
}

/** The error code Settings › Connections shows in the main window, if any. */
export async function connectionsError(context: StepContext): Promise<string | undefined> {
  if (!(await onWorkspace(context)).passed) return undefined;
  if (!(await openConnections(context))) return undefined;
  const { value } = await waitForText(context, 20_000, errorCodeIn);
  return value;
}

async function waitForTrue<T>(
  context: StepContext,
  read: () => Promise<T | undefined>,
): Promise<T | undefined> {
  for (let tries = 0; tries < windowWaitMs / 2_000; tries += 1) {
    const value = await read();
    if (value !== undefined) return value;
    await context.sleep(2_000);
  }
  return undefined;
}
