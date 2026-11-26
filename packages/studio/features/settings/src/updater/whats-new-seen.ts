/** The part of browser storage the "Updated to" dialog uses: `window.localStorage` has it. */
export type SeenStore = Pick<Storage, "getItem" | "setItem">;

const KEY = "halonic.updater.whatsNewSeen";

/**
 * Whether the "Updated to" dialog for `version` is due on this page, and if so, notes it as
 * shown. The shell says `justUpdated` for the whole first run after an update, so a reload would
 * show it again without this. Without storage, or when it refuses, the dialog shows: missing it
 * would hide the update, and the shell stops saying it at the next start anyway.
 */
export function whatsNewDue(version: string, store: SeenStore | null = browserStore()): boolean {
  if (store === null) return true;
  try {
    if (store.getItem(KEY) === version) return false;
    store.setItem(KEY, version);
  } catch (error) {
    console.error("The updated-to dialog couldn't note that it was shown.", error);
  }
  return true;
}

function browserStore(): SeenStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch (error) {
    // Storage that is turned off throws on the first touch.
    console.error("Browser storage isn't available for the updated-to dialog.", error);
    return null;
  }
}
