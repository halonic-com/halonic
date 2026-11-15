import {
  isHalonicSecretName,
  isPluginSecretName,
  type Secrets,
  type TokenStore,
} from "@halonicjs/ports";
import type { KeyEntry, ModelKeys } from "@halonicjs/studio-feature-models/api";
import type { SecretText } from "@halonicjs/studio-kit";

/** The key entry of the desktop app: the field is there and this computer's keychain keeps the key. */
const desktopEntry: KeyEntry = { kind: "field", keptOn: "this-computer", offHostHttps: false };

/**
 * The API keys of a workspace's providers, kept in the OS keychain. A workspace picks the secret
 * name, so every method refuses the names that belong to Halonic or to a plugin, as
 * `workspaceSecrets` does for reading. No method returns a key, and no error repeats one.
 */
export class WorkspaceModelKeys implements ModelKeys {
  readonly entry: KeyEntry = desktopEntry;
  readonly #keychain: Secrets & TokenStore;

  /** @param keychain - the OS keychain, before the workspace's name rule */
  constructor(keychain: Secrets & TokenStore) {
    this.#keychain = keychain;
  }

  async stored(secretName: string): Promise<boolean> {
    return (await this.#keychain.get(this.#picked(secretName))) !== null;
  }

  async save(secretName: string, key: SecretText): Promise<void> {
    await this.#keychain.set(this.#picked(secretName), key.reveal());
  }

  async remove(secretName: string): Promise<void> {
    await this.#keychain.remove(this.#picked(secretName));
  }

  #picked(name: string): string {
    if (isHalonicSecretName(name) || isPluginSecretName(name)) {
      throw new RangeError(
        "A provider can't use a secret name that belongs to Halonic or a plugin.",
      );
    }
    return name;
  }
}
