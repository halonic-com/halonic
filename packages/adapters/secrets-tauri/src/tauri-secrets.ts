import { type Secrets, secretKey, type TokenStore } from "@halonicjs/ports";
import { KeychainError, keychainFailure } from "./keychain-error.ts";
import { secretCommands, type TauriShell } from "./shell.ts";

/**
 * Secrets and tokens in the OS keychain, for the Studio desktop app: every
 * call goes to the shell's `secret_get`, `secret_set` or `secret_delete`
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
 * Secrets and tokens share the one keychain service, as they do in the CLI,
 * so a token and a configured secret with the same name are the same entry.
 */
export class TauriSecrets implements Secrets, TokenStore {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /**
   * The stored value, or `null` when nothing is stored under the name.
   *
   * @throws RangeError when the name breaks the secret name rule
   * @throws KeychainError when the keychain can't be read
   */
  async get(name: string): Promise<string | null> {
    checkName(name);
    const answer = await this.#call(secretCommands.get, { name });
    if (answer === null || typeof answer === "string") {
      return answer;
    }
    throw new KeychainError("backend", "the shell's answer is not a value");
  }

  /**
   * Stores the value, replacing one already stored under the name.
   *
   * @throws RangeError when the name breaks the rule, or the shell refuses the value
   * @throws KeychainError when the keychain can't be written
   */
  async set(name: string, value: string): Promise<void> {
    checkName(name);
    await this.#call(secretCommands.set, { name, value });
  }

  /**
   * Removes the value. Removing a name that holds nothing succeeds.
   *
   * @throws RangeError when the name breaks the secret name rule
   * @throws KeychainError when the keychain can't be written
   */
  async remove(name: string): Promise<void> {
    checkName(name);
    await this.#call(secretCommands.delete, { name });
  }

  /** Runs one command, turning a refusal into a `RangeError` or a {@link KeychainError}. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, args);
    } catch (reason) {
      throw keychainFailure(reason);
    }
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
