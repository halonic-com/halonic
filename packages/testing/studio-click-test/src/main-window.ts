import type { Driver } from "./webdriver.ts";
import { basicsText } from "./words.ts";

const findWaitMs = 30_000;
const pollMs = 1_000;

/**
 * Finds Studio's main window among the app's windows: the one whose title ends in the plain app
 * name, "… · Halonic" or "Halonic". The focused apps' titles end in their own name, such as
 * "Halonic Inbox". After a restart, Inbox or Messenger can open next to Studio and come first in
 * the handle list (studio-preview run 45921260296), so the first handle isn't always Studio's.
 * Waits up to 30 seconds for the page titles, then falls back to the first handle, which leaves
 * the steps to fail on the window they see and says so in the log.
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
      if (isMainTitle(await driver.title())) return handle;
    }
  }
  const [first = ""] = handles;
  console.error(`No window is titled as Studio's main window; using the first, ${first}.`);
  if (first !== "") await driver.switchToWindow(first);
  return first;
}

/** Whether a window title is Studio's main window's: its last part is the plain app name. */
export function isMainTitle(title: string): boolean {
  const parts = title.split(basicsText.titleSeparator.text);
  return parts[parts.length - 1] === basicsText.appName.text;
}
