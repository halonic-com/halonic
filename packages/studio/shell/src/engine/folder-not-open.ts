import { errorKindOf } from "@halonicjs/std";

/**
 * True for the desktop shell's refusal of a folder that isn't open in this window
 * (`folder_not_open`), anywhere in the error's causes: the Tauri stores keep it as the cause of
 * their `denied` error. Its message is the shell's own, with the folder's full path, and starting
 * again gets the same refusal, so a page says it as a failure Halonic can't explain, with the
 * shell's text in **Copy details** only (UX check S4, as the engine lock does; C613 row 33).
 *
 * @example
 * isFolderNotOpen(new KindedError("denied", "…", { cause: { kind: "folder_not_open", message: "…" } })); // true
 * isFolderNotOpen(new WorkspaceUntrusted("This workspace isn't trusted yet.")); // false
 */
export function isFolderNotOpen(error: unknown): boolean {
  if (errorKindOf(error) !== "denied") return false;
  // A few links at most; the bound keeps a cause that points back at itself from looping.
  let cause: unknown = (error as { readonly cause?: unknown }).cause;
  for (let depth = 0; depth < 8 && typeof cause === "object" && cause !== null; depth++) {
    if ((cause as { readonly kind?: unknown }).kind === "folder_not_open") return true;
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return false;
}
