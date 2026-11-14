import {
  DurableCoordination,
  DurableScheduler,
  defaultCoordinationObjectName,
  defaultRoutinesObjectName,
  Watchdog,
} from "@halonicjs/adapter-cloudflare-durable";
import {
  D1RecordStore,
  D1RunList,
  R2BlobStore,
  R2DefinitionSource,
} from "@halonicjs/adapter-cloudflare-storage";
import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";
import { createTokenStore } from "@halonicjs/adapter-token-store";
import type { Clock, PasswordHasher, Secrets } from "@halonicjs/ports";
import { ConfigurationError, missingBindings, type RuntimeEnv, requiredSecrets } from "./env.ts";
import { limitPasswordLength } from "./password-limit.ts";
import { workerSecrets } from "./worker-secrets.ts";

/** What the Worker asks of the routines object: to run the tick for a time. */
export interface RoutineTicks {
  tick(at: string): Promise<void>;
}

/** The adapters of one deployment, built from the Worker's `env`. */
export interface Runtime {
  readonly clock: Clock;
  readonly secrets: Secrets;
  readonly records: D1RecordStore;
  readonly runs: D1RunList;
  readonly blobs: R2BlobStore;
  readonly definitions: R2DefinitionSource;
  readonly coordination: DurableCoordination<DurableObjectId>;
  readonly scheduler: DurableScheduler<DurableObjectId>;
  readonly routines: RoutineTicks;
  readonly watchdog: Watchdog;
  readonly tokens: ReturnType<typeof createTokenStore>;
  readonly passwords: PasswordHasher;
}

/** How a runtime is built, beyond its `env`. */
export interface RuntimeOptions {
  /**
   * Puts the blobs, the snapshots and every Durable Object name under this scope, so a test gets
   * storage of its own from the bindings it shares. A deployment never sets it. The Durable
   * Objects are named `scope` itself (the scheduler's, `scope` and the key).
   */
  scope?: string;
}

/** Where in R2 a scope's keys go. */
export function scopedKeyPrefix(scope: string): string {
  return `${scope}/`;
}

/**
 * Names what the deployment lacks: bindings first, then the secrets that are
 * not configured. Reads each secret only to see that it is there.
 *
 * @returns the names; empty when the deployment is complete
 */
export async function missingConfiguration(env: Partial<RuntimeEnv>): Promise<string[]> {
  const secrets = workerSecrets(env);
  const missing = missingBindings(env);
  for (const name of requiredSecrets) {
    if ((await secrets.get(name)) === null) {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * Wires every Cloudflare adapter to the Worker's bindings and secrets.
 *
 * @throws ConfigurationError when a binding or a secret is missing; the message names them, never a value
 *
 * @param env - the Worker's bindings and secrets
 * @param options - only a test sets any
 *
 * @example
 * const runtime = await createRuntime(env);
 * await runtime.watchdog.sweep();
 */
export async function createRuntime(
  env: RuntimeEnv,
  options: RuntimeOptions = {},
): Promise<Runtime> {
  const { scope } = options;
  const missing = await missingConfiguration(env);
  if (missing.length > 0) {
    throw new ConfigurationError(missing);
  }
  const clock: Clock = { now: () => new Date() };
  const secrets = workerSecrets(env);
  const records = new D1RecordStore(env.DB);
  const runs = new D1RunList(env.DB);
  const definitionOptions = scope === undefined ? {} : { keyPrefix: scopedKeyPrefix(scope) };
  const scheduler = new DurableScheduler({ namespace: env.RUN, namePrefix: scope ?? "" });
  return {
    clock,
    secrets,
    records,
    runs,
    blobs: new R2BlobStore(env.BLOBS, scope === undefined ? undefined : scopedKeyPrefix(scope)),
    definitions: new R2DefinitionSource(env.DEFINITIONS, definitionOptions),
    coordination: new DurableCoordination({
      namespace: env.COORDINATION,
      objectName: scope ?? defaultCoordinationObjectName,
    }),
    scheduler,
    routines: env.ROUTINES.get(env.ROUTINES.idFromName(scope ?? defaultRoutinesObjectName)),
    watchdog: new Watchdog({ runs, scheduler, clock }),
    tokens: createTokenStore({ records, secrets, clock }),
    passwords: limitPasswordLength(createPbkdf2ChainHasher()),
  };
}
