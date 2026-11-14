// What `halonic secret` does, as `app.secret-service` asks. The command only
// reads what the person typed and prints the outcome; the rules live here, so
// the Studio can offer the same thing later.

import {
  checkSecretValue,
  describeSecretName,
  isQuotableSecretName,
  type PasswordHasher,
  type SecretStore,
  secretKey,
  tokenNamePrefix,
} from "@halonicjs/ports";

/** The name the server's sign-in password hash is kept under. */
const servePasswordName = "serve-password";

/** The longest sign-in password, in UTF-16 code units. Bounds the work one hash costs. */
const maxServePasswordLength = 1024;

const servePasswordKey = secretKey(servePasswordName);
const tokenKey = secretKey("token-key");
const tokenKeyPrefix = secretKey(tokenNamePrefix);

/** What {@link SecretService} needs from the host. */
interface SecretServiceOptions {
  /** The secrets in the user's profile. */
  readonly store: SecretStore;
  /** Makes the hash the sign-in password is kept as. */
  readonly hasher: PasswordHasher;
}

/** The outcome of a change a person asked for. */
export type SecretChange =
  | { readonly changed: true }
  | {
      readonly changed: false;
      /** Why not, in plain text for the person. It never repeats a value. */
      readonly reason: string;
    };

/** What a person typed to set a secret. */
export interface SecretInput {
  readonly name: string;
  readonly value: string;
  /**
   * The value typed a second time. Required for the sign-in password, where a
   * typing mistake would lock the person out; other secrets ignore it.
   */
  readonly confirmation?: string;
}

/**
 * Sets, removes and lists the secrets of the person's profile. A store error
 * (a file that can't be written) is thrown as it is; a refusal the person can
 * act on is returned as a reason.
 *
 * @example
 * const secrets = new SecretService({ store, hasher });
 * await secrets.set({ name: "openai-key", value: "sk-live-1234" }); // { changed: true }
 * await secrets.set({ name: "token-key", value: "x" }); // { changed: false, reason: ... }
 */
export class SecretService {
  private readonly store: SecretStore;
  private readonly hasher: PasswordHasher;

  constructor(options: SecretServiceOptions) {
    this.store = options.store;
    this.hasher = options.hasher;
  }

  /**
   * What setting `name` needs, so a command can tell the person before they
   * type a value: the reason the name is refused, or whether the value must
   * be typed twice (the sign-in password).
   */
  planSet(name: string): { readonly reason: string } | { readonly typedTwice: boolean } {
    const refusal = this.refuseName(name);
    if (refusal !== null && !refusal.changed) {
      return { reason: refusal.reason };
    }
    return { typedTwice: secretKey(name) === servePasswordKey };
  }

  /** Saves a secret, replacing the one under the same name. */
  async set(input: SecretInput): Promise<SecretChange> {
    const refusal = this.refuseName(input.name);
    if (refusal !== null) {
      return refusal;
    }
    if (secretKey(input.name) === servePasswordKey) {
      return await this.setServePassword(input);
    }
    try {
      checkSecretValue(input.value);
    } catch (error) {
      return { changed: false, reason: rangeMessage(error) };
    }
    await this.store.set(input.name, input.value);
    return { changed: true };
  }

  /** Removes a secret. Removing one that isn't stored succeeds. */
  async remove(name: string): Promise<SecretChange> {
    const refusal = this.refuseName(name);
    if (refusal !== null) {
      return refusal;
    }
    await this.store.remove(name);
    return { changed: true };
  }

  /** The names of the secrets a person may set, never a value. */
  async list(): Promise<readonly string[]> {
    const names = await this.store.names();
    return names.filter((name) => !isTokenName(secretKey(name)));
  }

  private async setServePassword(input: SecretInput): Promise<SecretChange> {
    if (input.value === "") {
      return { changed: false, reason: "The password can't be empty." };
    }
    if (input.value.length > maxServePasswordLength) {
      return {
        changed: false,
        reason: `The password can be at most ${maxServePasswordLength} characters; this one has ${input.value.length}.`,
      };
    }
    if (input.confirmation !== input.value) {
      return { changed: false, reason: "The two passwords are not the same. Nothing was saved." };
    }
    await this.store.set(servePasswordName, await this.hasher.hash(input.value));
    return { changed: true };
  }

  /** A refusal for a name a person can't set or remove, or `null` when it is fine. */
  private refuseName(name: string): SecretChange | null {
    let key: string;
    try {
      key = secretKey(name);
    } catch (error) {
      return { changed: false, reason: rangeMessage(error) };
    }
    if (isTokenName(key)) {
      const shown = isQuotableSecretName(name) ? describeSecretName(name) : "This name";
      return {
        changed: false,
        reason: `${shown} belongs to Halonic's sign-in tokens and can't be changed here.`,
      };
    }
    return null;
  }
}

function isTokenName(key: string): boolean {
  return key === tokenKey || key.startsWith(tokenKeyPrefix);
}

/** A `RangeError` from the secret rules; their messages never repeat a value. */
function rangeMessage(error: unknown): string {
  if (error instanceof RangeError) {
    return error.message;
  }
  throw error;
}
