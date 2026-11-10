import { isPlainObject } from "@halonicjs/std";

/**
 * The part of Tauri's IPC this adapter needs. The shell puts `invoke` on the
 * app's own page (`window.__TAURI_INTERNALS__`), and the `desktop-secrets`
 * capability lets that page call the three `secret_*` commands. Passed in, so
 * tests use a fake shell and the adapter needs no Tauri library.
 */
export interface TauriShell {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * The shell's keychain commands (`apps/studio/src-tauri/src/secrets.rs`). The
 * Android Keystore backend (HAL-1211) answers the same three commands, so this
 * adapter is the same on desktop and Android.
 */
export const secretCommands = {
  /** `{ name }` → the value, or `null` when nothing is stored. */
  get: "secret_get",
  /** `{ name, value }` → nothing; replaces a stored value. */
  set: "secret_set",
  /** `{ name }` → nothing; also when nothing is stored. */
  delete: "secret_delete",
} as const;

/**
 * Why the shell refused a call: the `kind` of its `SecretError`
 * (`crates/secrets/src/error.rs`), the same on desktop and Android.
 */
export const refusalKinds = [
  "invalid_name",
  "invalid_value",
  "unavailable",
  "denied",
  "unreadable",
  "backend",
] as const;

/** One of {@link refusalKinds}. */
export type RefusalKind = (typeof refusalKinds)[number];

/** What a refused command rejects with: a stable kind, and a message that never holds the value. */
export interface ShellRefusal {
  readonly kind: RefusalKind;
  readonly message: string;
}

/**
 * Whether a rejection is the shell's refusal shape, as opposed to an IPC or
 * permission failure. Tauri's IPC hands the page the refusal as parsed JSON,
 * so only a plain object counts: an `Error` that happens to carry a `kind` is
 * a failure on the page's side, and its text is not the shell's.
 */
export function isShellRefusal(reason: unknown): reason is ShellRefusal {
  if (!isPlainObject(reason)) {
    return false;
  }
  const { kind, message } = reason;
  return refusalKinds.some((known) => known === kind) && typeof message === "string";
}
