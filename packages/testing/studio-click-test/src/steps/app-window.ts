import type { StepContext } from "../runner.ts";
import { pollEveryMs } from "../screen.ts";

const windowWaitMs = 30_000;

/**
 * Opens a Start menu shortcut, such as "Halonic Inbox", and switches to the
 * window it shows: the first one other than the main window whose text
 * `shows` accepts. With `onlyNew`, a window that was open before doesn't
 * count, so the shortcut itself must have opened it. Returns the window's
 * last text when none showed.
 */
export async function openAppWindow(
  context: StepContext,
  shortcut: string,
  shows: (text: string) => boolean,
  onlyNew = false,
): Promise<{ opened: boolean; text: string }> {
  const { driver } = context;
  const before = onlyNew ? await driver.windowHandles() : [context.mainWindow];
  await context.openShortcut(shortcut);
  let text = "";
  for (let read = 0; read < windowWaitMs / pollEveryMs; read += 1) {
    const handles = await driver.windowHandles();
    for (const handle of handles.filter((each) => !before.includes(each))) {
      await driver.switchToWindow(handle);
      text = await driver.pageText().catch(() => "");
      if (shows(text)) return { opened: true, text };
    }
    await context.sleep(pollEveryMs);
  }
  return { opened: false, text };
}
