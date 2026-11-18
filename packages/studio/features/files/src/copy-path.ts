import type { ToastStore, WriteClipboard } from "@halonicjs/studio-kit";
import { filesWords } from "./files-words.ts";

/** Puts a file's path on the clipboard and says so in a toast, or says the clipboard didn't take it. */
export async function copyPath(
  writeClipboard: WriteClipboard,
  toasts: ToastStore | null,
  path: string,
): Promise<void> {
  const copied = await writeClipboard(path);
  toasts?.show(
    copied
      ? { tone: "success", title: filesWords.pathCopied(path) }
      : { tone: "danger", title: filesWords.pathNotCopied },
  );
}
