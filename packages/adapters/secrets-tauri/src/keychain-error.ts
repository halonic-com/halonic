import type { ErrorKind } from "@halonicjs/std";
import { isShellRefusal, type RefusalKind } from "./shell.ts";

/** The refusals that are the keychain's doing, not the caller's. */
export type KeychainRefusalKind = Exclude<RefusalKind, "invalid_name" | "invalid_value">;

/** How a surface should respond to each keychain refusal. */
const errorKinds: Readonly<Record<KeychainRefusalKind, ErrorKind>> = {
  // No keychain on this system, or it can't be reached right now.
  unavailable: "unavailable",
  // The user or the system said no, for example at an unlock prompt.
  denied: "denied",
  // The value can't be decrypted any more and the shell deleted it: the
  // user enters it, or signs in, again. Like the token store's
  // `UnreadableTokenError`, never `null`, so it never looks like "not set".
  unreadable: "unauthenticated",
  // Any other keychain failure; a retry may work.
  backend: "unavailable",
};

/**
 * A keychain call that failed for a reason other than a bad name or value.
 * `refusal` is the shell's own kind, the same on desktop and Android; `kind`
 * is how a surface should respond. The message never holds a value.
 */
export class KeychainError extends Error {
  override readonly name = "KeychainError";
  readonly refusal: KeychainRefusalKind;

  /**
   * @param refusal - the shell's kind
   * @param message - the shell's message, which never holds the value
   */
  constructor(refusal: KeychainRefusalKind, message: string) {
    super(`The keychain refused the call (${refusal}): ${message}`);
    this.refusal = refusal;
  }

  get kind(): ErrorKind {
    return errorKinds[this.refusal];
  }
}

/**
 * The error a rejected `secret_*` command becomes. A bad name or value is the
 * caller's mistake, so it is a `RangeError`, as the ports ask for a bad name.
 * Anything that isn't the shell's refusal shape (a missing capability, a
 * broken IPC call) becomes a `backend` refusal. Its text is dropped, because
 * the adapter can't vouch that it holds no value.
 */
export function keychainFailure(reason: unknown): Error {
  if (!isShellRefusal(reason)) {
    return new KeychainError("backend", "the shell gave no answer");
  }
  switch (reason.kind) {
    case "invalid_name":
    case "invalid_value":
      return new RangeError(`The keychain refused the call (${reason.kind}): ${reason.message}`);
    default:
      return new KeychainError(reason.kind, reason.message);
  }
}
