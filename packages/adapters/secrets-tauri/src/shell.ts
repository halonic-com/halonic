import { isPlainObject } from "@halonicjs/std";

/**
 * The part of Tauri's IPC this adapter needs. The shell puts `invoke` on the
 * app's own page (`window.__TAURI_INTERNALS__`), and the `desktop-secrets`
 * capability lets that page call the `secret_*` and `token_*` commands. Passed in, so
 * tests use a fake shell and the adapter needs no Tauri library.
 */
export interface TauriShell {
  /** Calls a shell command with its arguments; rejects with the shell's refusal, or with the IPC's own failure. */
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * The shell's keychain commands (`apps/studio/src-tauri/src/secrets.rs`). The
 * Android Keystore backend (HAL-1211) answers the same commands, so this
 * adapter is the same on desktop and Android.
 */
export const secretCommands = {
  /** `{ name }` → the value, or `null` when nothing is stored. */
  get: "secret_get",
  /** `{ name }` → `true` or `false`: whether a value is stored. The answer holds no value. */
  has: "secret_has",
  /** `{ name, value }` → nothing; replaces a stored value. */
  set: "secret_set",
  /** `{ name }` → nothing; also when nothing is stored. */
  delete: "secret_delete",
} as const;

/**
 * The shell's commands for the origins a stored key may be sent to
 * (`apps/studio/src-tauri/src/secrets.rs`, HAL-11887). The shell keeps them
 * beside the key and makes each origin from the address itself.
 */
export const keyOriginCommands = {
  /** `{ name }` → the key's origins, or `null` when none is recorded. */
  allowed: "secret_allowed_origins",
  /** `{ name, address }` → an {@link AllowOriginResult}; adds the address' origin to the key's list. */
  allow: "secret_allow_origin",
} as const;

/** Why an address can't be an allowed origin, as the shell and the CLI's secrets file say it. */
export type AddressProblem = "not-an-address" | "has-user-info";

/** What allowing an origin for a key did: the shell's answer, in the shape the CLI's secrets file uses. */
export type AllowOriginResult =
  | { readonly result: "added" | "already-allowed"; readonly origin: string }
  | { readonly result: "no-key" | "full" }
  | { readonly result: "bad-address"; readonly problem: AddressProblem };

/**
 * The shell's token commands (`apps/studio/src-tauri/src/secrets.rs`), the
 * page's only way to a token. The shell keeps each token under the token
 * prefix and the token's canonical name; the page names the token only.
 */
export const tokenCommands = {
  /** `{ name }` → the token, or `null` when nothing is stored. */
  get: "token_get",
  /** `{ name, value }` → nothing; replaces a stored token. */
  set: "token_set",
  /** `{ name }` → nothing; also when nothing is stored. */
  delete: "token_delete",
} as const;

/**
 * Why the shell refused a call: the `kind` of its `SecretError`
 * (`crates/secrets/src/error.rs`), the same on desktop and Android.
 */
export const refusalKinds = [
  "invalid_name",
  "reserved_name",
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
