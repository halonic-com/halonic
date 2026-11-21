import { copyText, type ToastStore, useToastStore, useWriteClipboard } from "@halonicjs/studio-kit";
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
    (details: string) => copyDetails(details, toasts, writeClipboard),
    [writeClipboard, toasts],
  );
}

/**
 * Copy details outside a React tree, such as a toast's action: as {@link useCopyDetails}, with the
 * toasts and the clipboard passed in.
 *
 * @example
 * await copyDetails(detailsOf("Can't open /work/old", error), shell.toasts);
 */
export async function copyDetails(
  details: string,
  toasts: ToastStore | null,
  writeClipboard: (text: string) => Promise<boolean> = copyText,
): Promise<void> {
  const copied = await writeClipboard(details);
  toasts?.show(
    copied
      ? { tone: "info", title: copyDetailsWords.copied }
      : { tone: "danger", title: copyDetailsWords.couldNotCopy },
  );
}

/**
 * Copy details for a Dialog's or FormSheet's `errorAction`, which confirms in place with
 * `doneLabel` {@link copyDetailsWords}`.done` (`kit.callout-done-label`), because toasts wait until
 * the dialog closes: no toast when the copy works, the "Couldn't copy." toast when it doesn't. It
 * gives whether the copy worked, so the action reads "Copied" only then.
 *
 * @example
 * const copy = useCopyDetailsInPlace();
 * <Dialog errorAction={{ label: copyDetailsWords.label, doneLabel: copyDetailsWords.done, onClick: () => copy(details) }} … />
 */
export function useCopyDetailsInPlace(): (details: string) => Promise<boolean> {
  const writeClipboard = useWriteClipboard();
  const toasts = useToastStore();
  return useCallback(
    async (details: string) => {
      const copied = await writeClipboard(details);
      if (!copied) toasts?.show({ tone: "danger", title: copyDetailsWords.couldNotCopy });
      return copied;
    },
    [writeClipboard, toasts],
  );
}
