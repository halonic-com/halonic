/** Version of the {@link IdGenerator} port. A breaking change bumps it and comes with an ADR. */
export const idGeneratorVersion = 1;

/**
 * Makes unique ids. Passed in, so the core needs no platform randomness and
 * tests can record event logs with fixed ids.
 *
 * Ids are unique, **not secret**: tests make them predictable on purpose.
 * Anything that must be unguessable, such as a session token, uses
 * `crypto.getRandomValues` instead.
 */
export interface IdGenerator {
  /** A new id that starts with the prefix, such as "run_…". */
  next(prefix: string): string;
}
