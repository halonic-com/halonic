import { type ErrorKind, KindedError } from "@halonicjs/std";

/**
 * A kinded error whose message is Halonic's own words for raw text it replaces, such as an OS
 * error with a path. The raw text goes only into `details`, which the Studio's **Copy details**
 * puts on the clipboard (`rawDetailsOf`, microcopy 22 F1); it never shows on screen.
 */
export class TrustStoreError extends KindedError {
  /** The raw text the message replaces, for the clipboard only. */
  readonly details: string;
  constructor(kind: ErrorKind, message: string, details: string) {
    super(kind, message);
    this.details = details;
  }
}

/**
 * The shell's `io` refusal of a trust command, whose message is its log text, such as an OS
 * error with a path (C548 5): Halonic's words, with that text only in the details.
 *
 * @param writes - whether the command changes the profile's records, not only reads them
 */
export function dataFolderRefusal(writes: boolean, message: string): TrustStoreError {
  const words = writes
    ? "Halonic can't write to its data folder."
    : "Halonic can't read its data folder.";
  return new TrustStoreError("unavailable", words, message);
}

/**
 * A call the shell gave no usable answer to; `reason` is its rejection, when there was one. It is
 * a bug the person can't fix, so it is `internal`, in microcopy 22 F13's words, and it never says
 * the desktop app didn't answer: the person is looking at it (C613 12).
 *
 * @param call - what the details call it, such as "trust call"
 */
export function noAnswer(call: string, reason?: unknown): TrustStoreError {
  const details = `The desktop shell gave no answer to the ${call}.`;
  return new TrustStoreError(
    "internal",
    "Halonic ran into a problem it can't explain yet.",
    reason === undefined ? details : `${details}\n${rejectionText(reason)}`,
  );
}

/** A rejection as text: Tauri rejects with a string, a broken call with an `Error`. */
function rejectionText(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}
