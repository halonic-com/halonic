import { isPlainObject } from "@halonicjs/std";

/** The shell's own refusals: `too-often` (a sign-in page opened a moment ago) and `unknown_service`. */
const shellKinds = ["too-often", "unknown_service"] as const;

/**
 * The keychain's refusals, as the shell's `SecretError` names them
 * (`crates/secrets/src/error.rs`).
 */
const keychainKinds = [
  "invalid_name",
  "reserved_name",
  "invalid_value",
  "unavailable",
  "denied",
  "unreadable",
  "backend",
] as const;

/** The record files' refusals: the record is full, or the disk failed. */
const recordKinds = ["record-full", "storage"] as const;

/** Every refusal the shell itself may answer with. */
const knownShellKinds: readonly string[] = [...shellKinds, ...keychainKinds, ...recordKinds];

/**
 * Why a shell call failed. The shell's own kinds: `too-often`,
 * `unknown_service`, the keychain's kinds, such as `denied` or
 * `unavailable`, and the record files' `record-full` and `storage`. The
 * adapter's: `not-opened` (the checks passed but the browser didn't open
 * the page), `sign-in-failed`, `malformed-answer` (the shell answered with
 * something this adapter doesn't know, a refusal of a kind not listed here
 * included, which it refuses rather than pass on) and `ipc` (the call
 * didn't reach the command, for example from a window without the
 * capability).
 */
export type ActionShellFailure =
  | (typeof shellKinds)[number]
  | (typeof keychainKinds)[number]
  | (typeof recordKinds)[number]
  | "not-opened"
  | "sign-in-failed"
  | "malformed-answer"
  | "ipc";

function isShellKind(kind: string): kind is ActionShellFailure {
  return knownShellKinds.includes(kind);
}

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
 * `{ kind, message }` keeps its kind, or is `malformed-answer` for a kind
 * this adapter doesn't know; anything else, such as Tauri's own
 * "not allowed", is `ipc`.
 */
export function shellFailure(command: string, reason: unknown): ActionShellError {
  if (isPlainObject(reason)) {
    const { kind, message } = reason;
    if (typeof kind === "string" && typeof message === "string") {
      return isShellKind(kind) ? new ActionShellError(kind, message) : malformedAnswer(command);
    }
  }
  const text = reason instanceof Error ? reason.message : String(reason);
  return new ActionShellError("ipc", `${command} didn't reach the shell: ${text}`);
}
