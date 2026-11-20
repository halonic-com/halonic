import { type KeyOrigins, maxAllowedOrigins, secretKey } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { KeychainError } from "./keychain-error.ts";
import { type AllowOriginResult, keyOriginCommands, type TauriShell } from "./shell.ts";
import { callShell } from "./shell-call.ts";

/**
 * The origins the keys in the OS keychain may be sent to, for the Studio
 * desktop app: every call goes to the shell's `secret_allowed_origins` or
 * `secret_allow_origin` command, which keeps them beside the key (HAL-11887).
 *
 * The model resolver reads them on every call with a key, so an answer that
 * isn't a list of origins is refused rather than read as "none": that would
 * put the key back on the older trust rule. Refusals are as for
 * `TauriSecrets`: a bad name is a `RangeError`, a keychain that is locked,
 * missing or refuses is a {@link KeychainError}.
 */
export class TauriKeyOrigins implements KeyOrigins {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /**
   * The origins the key may go to, or `undefined` when none is recorded.
   *
   * @throws RangeError when the name breaks the secret name rule or belongs to Halonic
   * @throws KeychainError when the keychain can't be read, or the answer isn't a list of origins
   */
  async allowedOrigins(name: string): Promise<readonly string[] | undefined> {
    secretKey(name);
    const answer = await callShell(this.#shell, keyOriginCommands.allowed, { name });
    if (answer === null) {
      return undefined;
    }
    if (isOriginList(answer)) {
      return answer;
    }
    throw new KeychainError("backend", "the shell's answer is not a list of origins");
  }

  /**
   * Adds the origin of `address` to the ones the key may go to, keeping the
   * others. The shell makes the origin; an address that can't be one, a key
   * that isn't stored and a full list are answers, not errors.
   *
   * @throws RangeError when the name breaks the secret name rule or belongs to Halonic
   * @throws KeychainError when the keychain can't be written, or the answer isn't one the shell gives
   */
  async allowOrigin(name: string, address: string): Promise<AllowOriginResult> {
    secretKey(name);
    const answer = await callShell(this.#shell, keyOriginCommands.allow, { name, address });
    if (isAllowOriginResult(answer)) {
      return answer;
    }
    throw new KeychainError("backend", "the shell's answer is not an outcome");
  }
}

/** One to {@link maxAllowedOrigins} different origins, each as `new URL(…).origin` writes it. */
function isOriginList(answer: unknown): answer is string[] {
  return (
    Array.isArray(answer) &&
    answer.length > 0 &&
    answer.length <= maxAllowedOrigins &&
    new Set(answer).size === answer.length &&
    answer.every(isOrigin)
  );
}

function isOrigin(origin: unknown): origin is string {
  return typeof origin === "string" && URL.parse(origin)?.origin === origin;
}

function isAllowOriginResult(answer: unknown): answer is AllowOriginResult {
  if (!isPlainObject(answer)) {
    return false;
  }
  switch (answer["result"]) {
    case "added":
    case "already-allowed":
      return isOrigin(answer["origin"]);
    case "no-key":
    case "full":
      return true;
    case "bad-address":
      return answer["problem"] === "not-an-address" || answer["problem"] === "has-user-info";
    default:
      return false;
  }
}
