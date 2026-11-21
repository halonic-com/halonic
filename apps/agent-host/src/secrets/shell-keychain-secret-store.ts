import {
  checkSecretValue,
  describeSecretName,
  hostSecretNames,
  type SecretStore,
  secretKey,
} from "@halonicjs/ports";
import type { ShellSecretRequest, ShellSecretsChannel } from "./shell-secrets-channel.ts";

/** The keychain couldn't do what the host asked. `kind` is the shell's reason (`unavailable`, `denied`, …). */
export class KeychainError extends Error {
  override name = "KeychainError";
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * The host's own secrets in the OS keychain, through Studio's shell
 * (requirement `agent-host.keychain-secrets`). The shell reaches only the
 * names of `hostSecretNames` (Rust's `HOST_NAMES`) and stops the host on any
 * other, so a different name is refused here, before anything is sent.
 *
 * Nothing falls back to the secrets file: when the keychain can't be used
 * (Linux without a Secret Service, say), every call fails with the shell's
 * reason as a {@link KeychainError}.
 */
export class ShellKeychainSecretStore implements SecretStore {
  readonly #channel: ShellSecretsChannel;

  constructor(channel: ShellSecretsChannel) {
    this.#channel = channel;
  }

  async get(name: string): Promise<string | null> {
    return this.#ask({ op: "get", name: keychainName(name) }, `read ${name}`);
  }

  async set(name: string, value: string): Promise<void> {
    const key = keychainName(name);
    checkSecretValue(value);
    await this.#ask({ op: "set", name: key, value }, `save ${name}`);
  }

  async remove(name: string): Promise<void> {
    await this.#ask({ op: "delete", name: keychainName(name) }, `remove ${name}`);
  }

  /** The host's names that hold a value: the keychain lists nothing, so each one is read. */
  async names(): Promise<readonly string[]> {
    const stored: string[] = [];
    for (const name of hostSecretNames) {
      if ((await this.get(name)) !== null) stored.push(name);
    }
    return stored;
  }

  async #ask(request: ShellSecretRequest, doing: string): Promise<string | null> {
    const answer = await this.#channel.ask(request);
    if (answer.ok) return answer.value;
    throw new KeychainError(answer.kind, `The keychain couldn't ${doing}: ${answer.message}`);
  }
}

const hostKeys = new Set(hostSecretNames.map(secretKey));

/**
 * The name as the keychain keeps it (`remote-host-key` is `remote_host_key`).
 *
 * @throws RangeError when it isn't one of the host's own names; the message names it only when it may
 */
function keychainName(name: string): string {
  const key = secretKey(name);
  if (!hostKeys.has(key)) {
    throw new RangeError(`${describeSecretName(name)} isn't one the host keeps in the keychain.`);
  }
  return key.toLowerCase();
}
