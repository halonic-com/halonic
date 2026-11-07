/** Version of the {@link Secrets} port. A breaking change bumps it and comes with an ADR. */
export const secretsVersion = 1;

/**
 * The secrets someone configured: provider keys, the sign-in password hash,
 * the token key. Read-only at run time (OS keychain, a mode-0600 file,
 * environment variables, Workers secrets). What the server writes itself goes
 * in the {@link TokenStore} instead.
 */
export interface Secrets {
  /** The secret's value, or `null` when it isn't configured. */
  get(name: string): Promise<string | null>;
}
