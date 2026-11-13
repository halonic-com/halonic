import type { CoordinationObject, RunObject } from "@halonicjs/adapter-cloudflare-durable";
import { halonicSecretNames } from "@halonicjs/ports";

/**
 * What the Worker's `env` holds: the bindings `wrangler.toml` declares. Secrets
 * are also in `env`, as string variables named `HALONIC_SECRET_<NAME>`; they are
 * read through {@link workerSecrets}, never by name from here.
 */
export interface RuntimeEnv {
  readonly COORDINATION: DurableObjectNamespace<CoordinationObject>;
  readonly RUN: DurableObjectNamespace<RunObject>;
  /** The record store, the run list and the migrations' bookkeeping. */
  readonly DB: D1Database;
  /** Blobs, content-addressed. */
  readonly BLOBS: R2Bucket;
  /** The workspace snapshots `halonic deploy` uploads. */
  readonly DEFINITIONS: R2Bucket;
}

/** The bindings every deployment needs, by the name `wrangler.toml` gives them. */
export const requiredBindings = [
  "COORDINATION",
  "RUN",
  "DB",
  "BLOBS",
  "DEFINITIONS",
] as const satisfies readonly (keyof RuntimeEnv)[];

/**
 * The secrets every deployment needs, by their port name: Halonic's own, the
 * token key and the sign-in password hash.
 */
export const requiredSecrets: readonly string[] = halonicSecretNames;

/** Thrown when the deployment lacks a binding or a secret. It names what is missing, never a value. */
export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`The Worker isn't fully configured. Missing: ${missing.join(", ")}.`);
    this.missing = missing;
  }
}

/**
 * The names of the bindings `env` lacks. A binding is missing when it is
 * absent, so a typo in `wrangler.toml` shows up here, by name, on the first
 * use rather than as an `undefined` deep inside an adapter.
 *
 * @example
 * missingBindings({ DB }); // ["COORDINATION", "RUN", "BLOBS", "DEFINITIONS"]
 */
export function missingBindings(env: Partial<RuntimeEnv>): string[] {
  return requiredBindings.filter((name) => env[name] === undefined);
}
