import type { StepContext } from "../runner.ts";
import { pollEveryMs } from "../screen.ts";

const windowWaitMs = 30_000;

/**
 * Opens a Start menu shortcut, such as "Halonic Inbox", and switches to the
 * window it shows: the first one other than the main window whose text
 * `shows` accepts, given its text and its Tauri label. With `onlyNew`, a
 * window that was open before doesn't count, so the shortcut itself must
 * have opened it. With `args`, the shortcut's program starts with them, such as `--app ask`.
 * Returns the window's last text when none showed.
 */
export async function openAppWindow(
  context: StepContext,
  shortcut: string,
  shows: (text: string, label: string) => boolean,
  onlyNew = false,
  args: readonly string[] = [],
): Promise<{ opened: boolean; text: string }> {
  const { driver } = context;
  const before = onlyNew ? await driver.windowHandles() : [context.mainWindow];
  await context.openShortcut(shortcut, args);
  let text = "";
  for (let read = 0; read < windowWaitMs / pollEveryMs; read += 1) {
    const handles = await driver.windowHandles();
    for (const handle of handles.filter((each) => !before.includes(each))) {
      await driver.switchToWindow(handle);
      text = await driver.pageText().catch(() => "");
      const label = await driver.windowLabel().catch(() => "");
      if (shows(text, label)) return { opened: true, text };
    }
    await context.sleep(pollEveryMs);
  }
  return { opened: false, text };
}
