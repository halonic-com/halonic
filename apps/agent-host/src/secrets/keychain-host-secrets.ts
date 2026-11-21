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
 * The keychain kept another value than it was given, and removing that
 * value failed too. The secrets file's copy is the right one and stays; the
 * message says so, because the next move would otherwise find two different
 * values and name the keychain's as the one that wins.
 */
export class KeychainUndoFailed extends Error {
  override name = "KeychainUndoFailed";
}

/**
 * Moves `name` out of the profile's secrets file into the keychain, once
 * (requirement `agent-host.keychain-secrets`). It writes the file's value to
 * the keychain, reads it back and compares, and only then removes it from
 * the file, so a keychain that dropped the value leaves the file's copy.
 * A keychain that gave back another value has that value removed again, so
 * the next try starts from an empty keychain instead of a false conflict.
 * When the keychain already holds the same value, it only removes the
 * file's copy.
 *
 * @throws {SecretMoveConflict} when the two hold different values; neither changes
 * @throws {KeychainUndoFailed} when the keychain gives back another value and removing it fails
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
      await undoKeychainWrite(name, keychain);
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
 * Removes the value the keychain kept instead of the one it was given.
 *
 * @throws {KeychainUndoFailed} when that fails, saying the file's copy is the right one
 */
async function undoKeychainWrite(name: string, keychain: SecretStore): Promise<void> {
  try {
    await keychain.remove(name);
  } catch (error) {
    const reason = error instanceof Error ? ` (${error.message})` : "";
    throw new KeychainUndoFailed(
      `The keychain didn't keep ${name} as it was given, and removing what it kept failed${reason}. ` +
        `The secrets file's copy of ${name} is the right one and stays; the keychain's is not: ` +
        `remove ${name} from the keychain, not from the secrets file, then start Studio again.`,
      { cause: error },
    );
  }
}

/**
 * The host's own secrets when Studio keeps them in the keychain: the
 * keychain, after the host's names were moved out of the secrets file
 * (see {@link moveIntoKeychain}). The move runs before the first use and
 * once after that; one that fails is tried again on the next use, and until
 * it succeeds every call fails with its error. The one exception is a
 * {@link KeychainUndoFailed}: tried again, it would read as a conflict whose
 * advice removes the file's good copy, so it stands until the host restarts.
 * Nothing falls back to the file, and each failure is logged once.
 */
export class KeychainHostSecrets implements SecretStore {
  readonly #keychain: SecretStore;
  readonly #file: SecretStore | undefined;
  readonly #log: (text: string) => void;
  #moving: Promise<void> | undefined;
  /** What the move has said already, so a failure tried again on every use is logged once. */
  readonly #said = new Set<string>();

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
      if (!(error instanceof KeychainUndoFailed)) this.#moving = undefined;
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

  // A failure here refuses every name, not only the one that failed. That is the same thing while
  // `hostSecretNames` holds one name; a second host secret needs a refusal per name.
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
        this.#sayOnce(`${error instanceof Error ? error.message : String(error)}\n`);
        throw error;
      }
    }
  }

  #sayOnce(text: string): void {
    if (this.#said.has(text)) return;
    this.#said.add(text);
    this.#log(text);
  }
}
