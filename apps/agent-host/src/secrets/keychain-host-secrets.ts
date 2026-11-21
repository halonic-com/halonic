import { hostSecretNames, type SecretStore } from "@halonicjs/ports";

/** What the move did with one name. */
export type MoveOutcome =
  /** The file held it and the keychain didn't: it is in the keychain now, and gone from the file. */
  | "moved"
  /** Both held the same value: the file's copy is gone. */
  | "copy-removed"
  /** The file didn't hold it: nothing to do. */
  | "nothing";

/**
 * The keychain and the secrets file hold different values under one name.
 * Nothing is removed: for `remote-host-key`, the wrong pick would unpair
 * every phone. The message says which store wins and what to do, and never
 * holds either value, nor a hash of one.
 */
export class SecretMoveConflict extends Error {
  override name = "SecretMoveConflict";
}

/**
 * Moves `name` out of the profile's secrets file into the keychain, once
 * (requirement `agent-host.keychain-secrets`). It writes the file's value to
 * the keychain, reads it back and compares, and only then removes it from
 * the file, so a keychain that dropped the value leaves the file's copy.
 * When the keychain already holds the same value, it only removes the
 * file's copy.
 *
 * @throws {SecretMoveConflict} when the two hold different values; neither changes
 * @throws Error when the keychain gives back another value than it was given; the file's copy stays
 */
export async function moveIntoKeychain(
  name: string,
  file: SecretStore,
  keychain: SecretStore,
): Promise<MoveOutcome> {
  const inFile = await file.get(name);
  if (inFile === null) return "nothing";
  const inKeychain = await keychain.get(name);
  if (inKeychain === null) {
    await keychain.set(name, inFile);
    if ((await keychain.get(name)) !== inFile) {
      throw new Error(
        `The keychain didn't keep ${name} as it was given, so it stays in the secrets file.`,
      );
    }
    await file.remove(name);
    return "moved";
  }
  if (inKeychain !== inFile) {
    throw new SecretMoveConflict(
      `The keychain and the secrets file hold different values of ${name}. ` +
        `The keychain's value wins, and the host doesn't use either until only one is left: ` +
        `remove ${name} from the secrets file to keep the keychain's.`,
    );
  }
  await file.remove(name);
  return "copy-removed";
}

/**
 * The host's own secrets when Studio keeps them in the keychain: the
 * keychain, after the host's names were moved out of the secrets file
 * (see {@link moveIntoKeychain}). The move runs before the first use and
 * once after that; one that fails is tried again on the next use, and until
 * it succeeds every call fails with its error. Nothing falls back to the
 * file.
 */
export class KeychainHostSecrets implements SecretStore {
  readonly #keychain: SecretStore;
  readonly #file: SecretStore | undefined;
  readonly #log: (text: string) => void;
  #moving: Promise<void> | undefined;

  /**
   * @param file - the profile's secrets file, or `undefined` without a profile (nothing to move)
   * @param log - where the move says what it did; it never writes a value
   */
  constructor(keychain: SecretStore, file: SecretStore | undefined, log: (text: string) => void) {
    this.#keychain = keychain;
    this.#file = file;
    this.#log = log;
  }

  /** Moves the host's names out of the secrets file, once; later calls wait for the same move. */
  moveOutOfFile(): Promise<void> {
    this.#moving ??= this.#move().catch((error: unknown) => {
      this.#moving = undefined;
      throw error;
    });
    return this.#moving;
  }

  async get(name: string): Promise<string | null> {
    await this.moveOutOfFile();
    return this.#keychain.get(name);
  }

  async set(name: string, value: string): Promise<void> {
    await this.moveOutOfFile();
    await this.#keychain.set(name, value);
  }

  async remove(name: string): Promise<void> {
    await this.moveOutOfFile();
    await this.#keychain.remove(name);
  }

  async names(): Promise<readonly string[]> {
    await this.moveOutOfFile();
    return this.#keychain.names();
  }

  async #move(): Promise<void> {
    const file = this.#file;
    if (file === undefined) return;
    for (const name of hostSecretNames) {
      try {
        const outcome = await moveIntoKeychain(name, file, this.#keychain);
        if (outcome === "moved")
          this.#log(`Moved ${name} from the secrets file to the keychain.\n`);
        if (outcome === "copy-removed") {
          this.#log(`Removed the secrets file's copy of ${name}; the keychain holds it.\n`);
        }
      } catch (error) {
        this.#log(`${error instanceof Error ? error.message : String(error)}\n`);
        throw error;
      }
    }
  }
}
