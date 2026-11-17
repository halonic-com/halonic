import type { ToastStore } from "@halonicjs/studio-kit";
import type { FilesHost, RemovedFile } from "./files-host.ts";
import { filesWords } from "./files-words.ts";
import { clearTrashed, markTrashed } from "./trash.ts";

/** The sentence an `Error` of the host gives; anything else gives none, as no system message reaches the user. */
function reasonOf(error: unknown): string | undefined {
  const reason = error instanceof Error ? error.message.trim() : "";
  return reason === "" ? undefined : reason;
}

/** Where focus goes in the tree around a delete: the row after the deleted one, and the restored row. */
export interface RemoveFocus {
  /** The file is in the trash; focus goes to the row that follows. */
  readonly removed?: () => void;
  /** Undo from the toast brought the file back; focus goes to its row. */
  readonly restored?: () => void;
}

/** Brings a deleted file back, or says why it couldn't. Success says nothing: the file's row is back. */
async function putBack(
  removed: RemovedFile,
  path: string,
  toasts: ToastStore | null,
): Promise<boolean> {
  try {
    await removed.undo();
    clearTrashed(path);
    return true;
  } catch (error) {
    // The delete can no longer be undone, so an open tab stops offering Undo.
    clearTrashed(path);
    const reason = reasonOf(error);
    toasts?.show({
      tone: "danger",
      title: filesWords.couldntPutBack(path),
      ...(reason === undefined ? {} : { text: reason }),
    });
    return false;
  }
}

/**
 * Deletes a file with no dialog: a toast with Undo says it (and, when other files name the file by
 * its id, a second line) with the file's full path, and an open tab of the file says so too. When it can't be deleted, a toast that stays says why and offers Try again.
 */
export async function removeFile(
  host: Pick<FilesHost, "remove">,
  toasts: ToastStore | null,
  path: string,
  focus: RemoveFocus = {},
): Promise<void> {
  try {
    const removed = await host.remove(path);
    const withLine = removed.places > 0;
    markTrashed(path, { undo: () => putBack(removed, path, toasts) });
    focus.removed?.();
    toasts?.show({
      tone: "success",
      title: filesWords.deleted(path, withLine),
      ...(withLine ? { text: filesWords.deletedPlaces(removed.places) } : {}),
      action: {
        label: filesWords.undo,
        onClick: () =>
          void putBack(removed, path, toasts).then((back) => {
            if (back) focus.restored?.();
          }),
      },
    });
  } catch (error) {
    const reason = reasonOf(error);
    toasts?.show({
      tone: "danger",
      title: filesWords.couldntDelete(path, reason),
      sticky: true,
      action: {
        label: filesWords.tryAgain,
        onClick: () => void removeFile(host, toasts, path, focus),
      },
    });
  }
}
