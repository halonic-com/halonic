// What `halonic secret` does, as `app.secrets-service` asks: the person's own
// secrets, saved, removed and listed. The rules live here and come back as a
// result, so a command only maps one to a message and an exit code.

import {
  isHalonicSecretName,
  isSecretName,
  maxSecretValueLength,
  type PasswordHasher,
  type SecretStore,
  secretKey,
} from "@halonicjs/ports";

/** The name the server's sign-in password is kept under, as a hash. */
export const servePasswordName = "serve-password";

/** The longest sign-in password `serve` accepts, as `host/server` checks it. */
export const maxServePasswordLength = 1024;

/** Why a secret wasn't saved or removed. None of them repeats the value. */
export type SecretRefusal =
  /** The name isn't a letter, then letters, digits, `-` or `_`, up to 128 characters. */
  | "invalid-name"
  /** The name belongs to Halonic's token store, which only Halonic writes. */
  | "reserved-name"
  | "empty-value"
  | "value-too-long"
  /** The password typed the second time wasn't the first one. */
  | "confirmation-differs"
  /** The sign-in password is longer than `serve` accepts. */
  | "password-too-long";

/** What {@link SecretsService.set} and {@link SecretsService.remove} did. */
export type SecretResult =
  | { readonly saved: true }
  | { readonly saved: false; readonly refusal: SecretRefusal };

/** What {@link SecretsService} needs from the host. */
export interface SecretsServiceOptions {
  /** The secrets in the user's profile. */
  readonly store: SecretStore;
  /** Makes the hash the sign-in password is kept as. */
  readonly hasher: PasswordHasher;
}

/**
 * Saves, removes and lists the secrets a person sets with `halonic secret`.
 * It never gives a value back: a listing is names only, and the sign-in
 * password is stored as a hash, never as text.
 *
 * @example
 * const secrets = new SecretsService({ store, hasher });
 * await secrets.set("openai-key", typed);
 * await secrets.set("serve-password", typed, typedAgain); // stored as a hash
 */
export class SecretsService {
  private readonly store: SecretStore;
  private readonly hasher: PasswordHasher;

  constructor(options: SecretsServiceOptions) {
    this.store = options.store;
    this.hasher = options.hasher;
  }

  /**
   * Whether `set` needs the value typed twice for this name, so the command
   * knows to ask again. True for the sign-in password only.
   */
  asksTwice(name: string): boolean {
    return isSecretName(name) && secretKey(name) === secretKey(servePasswordName);
  }

  /**
   * Saves a secret. The sign-in password is saved as a hash, and needs
   * `confirmation`, the same text typed a second time.
   */
  async set(name: string, value: string, confirmation?: string): Promise<SecretResult> {
    const refusal = this.refusalFor(name) ?? this.valueRefusal(name, value, confirmation);
    if (refusal !== undefined) {
      return { saved: false, refusal };
    }
    const stored = this.asksTwice(name) ? await this.hasher.hash(value) : value;
    await this.store.set(name, stored);
    return { saved: true };
  }

  /** Removes a secret. Removing one that isn't saved succeeds. */
  async remove(name: string): Promise<SecretResult> {
    const refusal = this.refusalFor(name);
    if (refusal !== undefined) {
      return { saved: false, refusal };
    }
    await this.store.remove(name);
    return { saved: true };
  }

  /** The names of the saved secrets, sorted, and never a value or a token. */
  async list(): Promise<readonly string[]> {
    return (await this.store.names()).filter((name) => !isTokenName(name));
  }

  /** Why the name can't be set or removed, or `undefined` when it can. */
  private refusalFor(name: string): SecretRefusal | undefined {
    if (!isSecretName(name)) {
      return "invalid-name";
    }
    return isTokenName(name) ? "reserved-name" : undefined;
  }

  private valueRefusal(
    name: string,
    value: string,
    confirmation: string | undefined,
  ): SecretRefusal | undefined {
    if (value === "") {
      return "empty-value";
    }
    if (this.asksTwice(name)) {
      if (value.length > maxServePasswordLength) {
        return "password-too-long";
      }
      return confirmation === value ? undefined : "confirmation-differs";
    }
    return value.length > maxSecretValueLength ? "value-too-long" : undefined;
  }
}

/** Halonic's own secrets that a person can't set: the token store's key and tokens. */
function isTokenName(name: string): boolean {
  return isHalonicSecretName(name) && secretKey(name) !== secretKey(servePasswordName);
}
