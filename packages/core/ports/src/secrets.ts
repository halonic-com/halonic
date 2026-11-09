/** Version of the {@link Secrets} port. A breaking change bumps it and comes with an ADR. */
export const secretsVersion = 1;

/**
 * The secrets someone configured: provider keys, the sign-in password hash,
 * the token key. Read-only at run time (OS keychain, a mode-0600 file,
 * environment variables, Workers secrets). What the server writes itself goes
 * in the {@link TokenStore} instead.
 *
 * **Names** match `^[A-Za-z][A-Za-z0-9_-]*$` and are at most 128 characters,
 * so the same name works as an environment variable, a Workers secret and a
 * keychain entry. `secretKey` and `isSecretName` below hold the rule, so
 * every adapter checks names the same way.
 *
 * **Two names that differ only in upper and lower case, or in `-` versus
 * `_`, are the same secret on every adapter.** The old environment adapter
 * upper-cased names and mapped `-` to `_` (`serve-password` is
 * `HALONIC_SECRET_SERVE_PASSWORD`), so a keychain or file store must match
 * names the same way. A prefix is up to the adapter.
 */
export interface Secrets {
  /**
   * The secret's value, or `null` when it isn't configured.
   *
   * @throws RangeError when the name breaks the rule above
   */
  get(name: string): Promise<string | null>;
}

/** The longest a `Secrets` or `TokenStore` name may be. */
export const maxSecretNameLength = 128;

const secretNamePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const printableAscii = /^[\x20-\x7E]*$/;

/**
 * Whether a name follows the name rule of the `Secrets` port: a letter,
 * then letters, digits, `-` or `_`, at most 128 characters. Workspace checks
 * use it to report a bad name in a file before anything asks a store for it.
 *
 * @example
 * isSecretName("openai-key"); // true
 * isSecretName("openai key"); // false
 */
export function isSecretName(name: string): boolean {
  return name.length <= maxSecretNameLength && secretNamePattern.test(name);
}

/**
 * The form two names are compared in: upper case, with `-` as `_`. Names
 * with the same key are the same secret on every adapter, as the
 * `Secrets` port requires. An adapter may store a different case of
 * it, but must match by it.
 *
 * @throws RangeError when the name breaks the rule; the message repeats the
 *   name only when {@link describeSecretName} allows it
 *
 * @example
 * secretKey("serve-password"); // "SERVE_PASSWORD"
 */
export function secretKey(name: string): string {
  if (!isSecretName(name)) {
    throw new RangeError(
      `${describeSecretName(name)} must be a letter, then letters, digits, "-" or "_", at most ${maxSecretNameLength} characters.`,
    );
  }
  return name.toUpperCase().replaceAll("-", "_");
}

/**
 * Whether a message may repeat a secret name: only when it is at most 128
 * printable ASCII characters. Anything else is more likely a value passed as
 * a name by mistake, so it must never reach a log or an error report.
 *
 * @example
 * isQuotableSecretName("openai key"); // true
 * isQuotableSecretName("x".repeat(300)); // false
 */
export function isQuotableSecretName(name: string): boolean {
  return name.length <= maxSecretNameLength && printableAscii.test(name);
}

/**
 * How a message may refer to a secret name: quoted when
 * {@link isQuotableSecretName} allows it, otherwise by its length only.
 *
 * @example
 * describeSecretName("openai key"); // 'Secret name "openai key"'
 * describeSecretName("x".repeat(300)); // "A secret name of 300 characters"
 */
export function describeSecretName(name: string): string {
  if (isQuotableSecretName(name)) {
    return `Secret name ${JSON.stringify(name)}`;
  }
  return `A secret name of ${name.length} characters`;
}
