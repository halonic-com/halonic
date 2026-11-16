import type { ToastStore } from "@halonicjs/studio-kit";
import type { FilesHost, RemovedFile } from "./files-host.ts";
import { filesWords } from "./files-words.ts";

/** The sentence an `Error` of the host gives; anything else gives none, as no system message reaches the user. */
function reasonOf(error: unknown): string | undefined {
  const reason = error instanceof Error ? error.message.trim() : "";
  return reason === "" ? undefined : reason;
}

/** The name the toasts use: the last part of the path. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Brings a deleted file back, or says why it couldn't. Success says nothing: the file's row is back. */
async function putBack(removed: RemovedFile, name: string, toasts: ToastStore | null) {
  try {
    await removed.undo();
  } catch (error) {
    const reason = reasonOf(error);
    toasts?.show({
      tone: "danger",
      title: filesWords.couldntPutBack(name),
      ...(reason === undefined ? {} : { text: reason }),
    });
  }
}

/**
 * Deletes a file with no dialog: a toast with Undo says it (and, when other files name the file by
 * its id, a second line). When it can't be deleted, a toast that stays says why and offers Try again.
 */
export async function removeFile(
  host: Pick<FilesHost, "remove">,
  toasts: ToastStore | null,
  path: string,
): Promise<void> {
  const name = nameOf(path);
  try {
    const removed = await host.remove(path);
    const withLine = removed.places > 0;
    toasts?.show({
      tone: "success",
      title: filesWords.deleted(name, withLine),
      ...(withLine ? { text: filesWords.deletedPlaces(removed.places) } : {}),
      action: { label: filesWords.undo, onClick: () => void putBack(removed, name, toasts) },
    });
  } catch (error) {
    const reason = reasonOf(error);
    toasts?.show({
      tone: "danger",
      title: filesWords.couldntDelete(name, reason),
      sticky: true,
      action: {
        label: filesWords.tryAgain,
        onClick: () => void removeFile(host, toasts, path),
      },
    });
  }
}
