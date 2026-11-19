import { maxSecretNameLength, secretKey, type TokenStore, tokenNamePrefix } from "@halonicjs/ports";
import { type TauriShell, tokenCommands } from "./shell.ts";
import { callShell, expectNothing, expectValue } from "./shell-call.ts";

/** The longest token name that still fits the keychain's name rule once the shell adds the prefix. */
export const maxTokenNameLength = maxSecretNameLength - tokenNamePrefix.length;

/**
 * Sign-in tokens in the OS keychain, for the Studio desktop app: every call
 * goes to the shell's `token_get`, `token_set` or `token_delete` command. The
 * shell keeps each token under `tokenNamePrefix` and the token's canonical
 * name, so a token is never the same entry as a secret of the same name, and
 * the secret commands can't reach it.
 *
 * The name is checked here as well, so a bad or too long name is refused
 * before anything is sent. Refusals are as for `TauriSecrets`: a bad
 * name or value is a `RangeError`, a keychain that is locked, missing or
 * refuses is a `KeychainError`.
 */
export class TauriTokens implements TokenStore {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /**
   * The stored token, or `null` when there is none.
   *
   * @throws RangeError when the name breaks the rule, or is longer than {@link maxTokenNameLength}
   * @throws KeychainError when the keychain can't be read
   */
  async get(name: string): Promise<string | null> {
    checkTokenName(name);
    return expectValue(await callShell(this.#shell, tokenCommands.get, { name }));
  }

  /**
   * Stores the token, replacing one already stored under the name.
   *
   * @throws RangeError when the name breaks the rule or is too long, or the shell refuses the value
   * @throws KeychainError when the keychain can't be written
   */
  async set(name: string, value: string): Promise<void> {
    checkTokenName(name);
    expectNothing(await callShell(this.#shell, tokenCommands.set, { name, value }, value));
  }

  /**
   * Removes the token. Removing one that isn't stored succeeds.
   *
   * @throws RangeError when the name breaks the rule, or is longer than {@link maxTokenNameLength}
   * @throws KeychainError when the keychain can't be written
   */
  async remove(name: string): Promise<void> {
    checkTokenName(name);
    expectNothing(await callShell(this.#shell, tokenCommands.delete, { name }));
  }
}

/**
 * Refuses a bad name before anything is sent: the ports' name rule, then the
 * length that still fits once prefixed. Neither message repeats the name,
 * which may be a value passed by mistake.
 */
function checkTokenName(name: string): void {
  secretKey(name);
  if (name.length > maxTokenNameLength) {
    throw new RangeError(
      `A token name may be at most ${maxTokenNameLength} characters in the desktop keychain.`,
    );
  }
}
