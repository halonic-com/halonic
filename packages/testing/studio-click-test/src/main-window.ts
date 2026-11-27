import type { Driver } from "./webdriver.ts";

/** The Tauri label of Studio's main window; the focused apps' windows are `inbox`, `messenger`, … */
export const mainWindowLabel = "main";

/** The Tauri label of Halonic Messenger's window. */
export const messengerWindowLabel = "messenger";

const findWaitMs = 30_000;
const pollMs = 1_000;

/**
 * Finds Studio's main window among the app's windows: the one Tauri labels `main`. After a
 * restart, Inbox or Messenger can open next to Studio and come first in the handle list
 * (studio-preview run 45921260296), so the first handle isn't always Studio's. Titles don't tell
 * them apart either: every window starts with studio.html's "Halonic" until its page sets its own
 * (run 45928570241). Waits up to 30 seconds for the window, then falls back to the first handle,
 * which leaves the steps to fail on the window they see and says so in the log.
 */
export async function findMainWindow(
  driver: Driver,
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  let handles: string[] = [];
  for (let waited = 0; waited <= findWaitMs; waited += pollMs) {
    if (waited > 0) await sleep(pollMs);
    handles = await driver.windowHandles();
    for (const handle of handles) {
      await driver.switchToWindow(handle);
      if ((await driver.windowLabel()) === mainWindowLabel) return handle;
    }
  }
  const [first = ""] = handles;
  console.error(`No window is labelled "${mainWindowLabel}"; using the first, ${first}.`);
  if (first !== "") await driver.switchToWindow(first);
  return first;
}
