import { type Secrets, secretKey, type TokenStore } from "@halonicjs/ports";
import { KeychainError } from "./keychain-error.ts";
import { secretCommands, type TauriShell } from "./shell.ts";
import { callShell, expectNothing, expectValue } from "./shell-call.ts";

/** Whether a value is stored, without reading it: what a page that only shows "Set" needs. */
export interface SecretPresence {
  has(name: string): Promise<boolean>;
}

/**
 * Secrets in the OS keychain, for the Studio desktop app: every
 * call goes to the shell's `secret_get`, `secret_has`, `secret_set` or `secret_delete`
 * command, which keeps the value under the service `halonic` in canonical
 * form, the same entry the CLI uses.
 *
 * The page never sees a keychain, only these commands, so the rules are the
 * shell's: the name rule is checked here as well, so a bad name is refused
 * before anything is sent, and the value rule (not empty, at most what the
 * platform's store holds) is the shell's alone. A refused value is a
 * `RangeError`; a keychain that is locked, missing or refuses is a
 * {@link KeychainError}.
 *
 * The shell refuses Halonic's own names here (`reserved_name`, a
 * `RangeError`): `token-key`, `serve-password` and every name under the
 * token prefix. Sign-in tokens go through `TauriTokens` instead.
 */
export class TauriSecrets implements Secrets, TokenStore, SecretPresence {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /**
   * The stored value, or `null` when nothing is stored under the name.
   *
   * @throws RangeError when the name breaks the secret name rule or belongs to Halonic
   * @throws KeychainError when the keychain can't be read
   */
  async get(name: string): Promise<string | null> {
    checkName(name);
    return expectValue(await this.#call(secretCommands.get, { name }));
  }

  /**
   * Whether a value is stored under the name. The shell answers yes or no, so
   * the value itself never reaches the page: use this, not {@link get}, to
   * show "Set" or "Not set".
   *
   * @throws RangeError when the name breaks the secret name rule or belongs to Halonic
   * @throws KeychainError when the keychain can't be read
   */
  async has(name: string): Promise<boolean> {
    checkName(name);
    const answer = await this.#call(secretCommands.has, { name });
    if (typeof answer === "boolean") {
      return answer;
    }
    throw new KeychainError("backend", "the shell's answer is not yes or no");
  }

  /**
   * Stores the value, replacing one already stored under the name.
   *
   * @throws RangeError when the name breaks the rule or belongs to Halonic, or the shell refuses the value
   * @throws KeychainError when the keychain can't be written
   */
  async set(name: string, value: string): Promise<void> {
    checkName(name);
    expectNothing(await this.#call(secretCommands.set, { name, value }, value));
  }

  /**
   * Removes the value. Removing a name that holds nothing succeeds.
   *
   * @throws RangeError when the name breaks the secret name rule or belongs to Halonic
   * @throws KeychainError when the keychain can't be written
   */
  async remove(name: string): Promise<void> {
    checkName(name);
    expectNothing(await this.#call(secretCommands.delete, { name }));
  }

  #call(command: string, args: Record<string, unknown>, value?: string): Promise<unknown> {
    return callShell(this.#shell, command, args, value);
  }
}

/**
 * Refuses a bad name before anything is sent to the shell. `secretKey` holds
 * the ports' rule and throws its `RangeError`, which never repeats a name that
 * may be a value passed by mistake.
 */
function checkName(name: string): void {
  secretKey(name);
}
