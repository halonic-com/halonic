import type { SaveState } from "@halonicjs/studio-shell";

/**
 * Runs one write of an item through the window's save state, which shows "Saving…", and for a
 * failure the toolbar's "Couldn't save · Try again" and the toast with the reason (microcopy 2).
 * `write` throws when it fails; **Try again** runs it again. Resolves to whether it was saved.
 */
export type SaveItem = (title: string, write: () => Promise<void>) => Promise<boolean>;

/** A page's way to save through the window's save state; `undefined` for a context built without a window. */
export function savingFor(
  saving: Pick<SaveState, "save"> | undefined,
  key: string,
): SaveItem | undefined {
  return saving === undefined ? undefined : (title, write) => saving.save({ key, title }, write);
}

/** Without a window's save state a failed write only logs, and its draft stays to be saved again. */
export async function saveWithoutWindow(
  write: () => Promise<void>,
  what: string,
): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    console.error(`Couldn't save the ${what}.`, error);
    return false;
  }
}
