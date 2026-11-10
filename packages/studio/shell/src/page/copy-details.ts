import { useToastStore, useWriteClipboard } from "@halonicjs/studio-kit";
import { useCallback } from "react";
import { copyDetailsWords } from "../errors/copy-details-words.ts";

/**
 * Gives Copy details: it puts `details` on the clipboard, then says how it went in a toast,
 * "Copied. Paste it into a bug report." or "Couldn't copy.". The clipboard and the toasts are the
 * ones the frame provides (`ClipboardProvider`, `ToastStoreProvider`).
 *
 * The approved toast also offers **Report a problem ›** (F13b). The Studio has no place for that
 * yet, so the toast leaves it out until one exists, rather than show a link that goes nowhere.
 */
export function useCopyDetails(): (details: string) => Promise<void> {
  const writeClipboard = useWriteClipboard();
  const toasts = useToastStore();
  return useCallback(
    async (details: string) => {
      const copied = await writeClipboard(details);
      toasts?.show(
        copied
          ? { tone: "info", title: copyDetailsWords.copied }
          : { tone: "danger", title: copyDetailsWords.couldNotCopy },
      );
    },
    [writeClipboard, toasts],
  );
}
