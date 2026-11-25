import { isPlainObject } from "@halonicjs/std";

/**
 * Why a shell call failed. The shell's own kinds: `too-often` (a sign-in
 * page opened a moment ago), `unknown_service` and the keychain's kinds,
 * such as `denied` or `unavailable`. The adapter's: `not-opened` (the checks
 * passed but the browser didn't open the page), `sign-in-failed`,
 * `malformed-answer` (the shell answered with something this adapter
 * doesn't know, which it refuses rather than pass on) and `ipc` (the call
 * didn't reach the command, for example from a window without the
 * capability).
 */
export type ActionShellFailure = string;

/**
 * A shell call that failed for a reason the `ActionSender` port has no
 * answer for. The message is the shell's or the adapter's own and never
 * holds a token: the shell never puts one in a refusal.
 */
export class ActionShellError extends Error {
  override readonly name = "ActionShellError";
  /** What failed, as {@link ActionShellFailure} lists. */
  readonly failure: ActionShellFailure;

  /**
   * @param failure - what failed
   * @param message - the shell's or the adapter's sentence
   */
  constructor(failure: ActionShellFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

/** An answer this adapter doesn't know: refused, never passed on. */
export function malformedAnswer(command: string): ActionShellError {
  return new ActionShellError(
    "malformed-answer",
    `The shell's answer to ${command} isn't one this version of Studio knows, so it was not used.`,
  );
}

/**
 * Turns a rejected `invoke` into an {@link ActionShellError}: the shell's
 * `{ kind, message }` keeps its kind; anything else, such as Tauri's own
 * "not allowed", is `ipc`.
 */
export function shellFailure(command: string, reason: unknown): ActionShellError {
  if (isPlainObject(reason)) {
    const { kind, message } = reason;
    if (typeof kind === "string" && typeof message === "string") {
      return new ActionShellError(kind, message);
    }
  }
  const text = reason instanceof Error ? reason.message : String(reason);
  return new ActionShellError("ipc", `${command} didn't reach the shell: ${text}`);
}
