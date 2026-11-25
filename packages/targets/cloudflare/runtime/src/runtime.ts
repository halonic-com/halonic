import {
  DurableCoordination,
  DurableRunEvents,
  DurableRunStore,
  DurableScheduler,
  defaultCoordinationObjectName,
  defaultRoutinesObjectName,
  Watchdog,
} from "@halonicjs/adapter-cloudflare-durable";
import {
  D1RecordStore,
  D1RunList,
  D1RunOwnership,
  DefinitionSnapshotError,
  R2BlobStore,
  R2DefinitionSource,
  type R2DefinitionSourceOptions,
} from "@halonicjs/adapter-cloudflare-storage";
import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";
import { createTokenStore } from "@halonicjs/adapter-token-store";
import type { Clock, PasswordHasher, Secrets } from "@halonicjs/ports";
import { ConfigurationError, missingBindings, type RuntimeEnv, requiredSecrets } from "./env.ts";
import { limitPasswordLength } from "./password-limit.ts";
import { definitionsVersionVariable } from "./serve-config.ts";
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
  /** Who started each run, kept in the run list's rows. */
  readonly ownership: D1RunOwnership;
  readonly runStore: DurableRunStore<DurableObjectId>;
  readonly runEvents: DurableRunEvents<DurableObjectId>;
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
   * Puts the records, the run list, the blobs, the snapshots and every Durable Object name under
   * this scope: a user's `u/<id>` or an organisation's `o/<id>` from the request's principal, or a
   * test's own, so two scopes on the same bindings share nothing. Without it, the runtime is the
   * deployment's own. The D1 rows carry the scope itself, under the empty scope without one; the
   * run objects are named `scope/` and the run id; the coordination and routines objects `scope`.
   */
  scope?: string;
  /**
   * Reads the deployment's own snapshot even under a scope. A scope's runtime (`scopedRuntime`)
   * and the run object set it, because every scope runs the workspace the deployer uploaded; a
   * test's scope leaves it out to keep a snapshot of its own.
   */
  sharedDefinitions?: boolean;
}

/** Where in R2 a scope's keys go. */
export function scopedKeyPrefix(scope: string): string {
  return `${scope}/`;
}

/**
 * The snapshot this Worker version serves. `halonic deploy` binds the version it wrote as
 * `HALONIC_DEFINITIONS_VERSION`, so each Worker version keeps reading its own snapshot: a deploy
 * whose self-test fails leaves the live version on its old one, and a rollback brings its snapshot
 * back. Only a missing variable falls back to `current`, the newest snapshot written, which
 * `wrangler dev` and the scoped tests use. A variable that is set but empty or isn't a snapshot
 * version is a configuration error, never a quiet fallback.
 *
 * @throws ConfigurationError naming the variable when its value is empty or malformed
 */
function definitionsVersionOf(env: object): string | undefined {
  if (!(definitionsVersionVariable in env)) return undefined;
  const value = (env as Record<string, unknown>)[definitionsVersionVariable];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigurationError([definitionsVersionVariable]);
  }
  return value.trim();
}

/**
 * The scope a run object's name prefix stands for: the prefix without its last `/`, or none for
 * the empty prefix. An object written before prefixes were noted has `null`, and was unscoped.
 *
 * @throws Error when the prefix doesn't end in `/`, so a broken name never stands for another scope
 */
export function scopeOfNamePrefix(namePrefix: string | null): string | undefined {
  if (namePrefix === null || namePrefix === "") return undefined;
  if (!namePrefix.endsWith("/")) {
    throw new Error("A run object's name prefix must end in /.");
  }
  return namePrefix.slice(0, -1);
}

/**
 * The options of the runtime a run object works with: the scope its name prefix stands for, with
 * the deployment's definitions, or the deployment's own runtime for an unscoped object.
 */
export function runtimeOptionsOfNamePrefix(namePrefix: string | null): RuntimeOptions {
  const scope = scopeOfNamePrefix(namePrefix);
  return scope === undefined ? {} : { scope, sharedDefinitions: true };
}

/** The definitions of this Worker version: its pinned snapshot, under the scope when a test sets one. */
function definitionsOf(env: RuntimeEnv, options: RuntimeOptions): R2DefinitionSource {
  const { scope, sharedDefinitions = false } = options;
  const version = definitionsVersionOf(env);
  const sourceOptions: R2DefinitionSourceOptions = {
    ...(scope === undefined || sharedDefinitions ? {} : { keyPrefix: scopedKeyPrefix(scope) }),
    ...(version === undefined ? {} : { version }),
  };
  try {
    return new R2DefinitionSource(env.DEFINITIONS, sourceOptions);
  } catch (error) {
    if (error instanceof DefinitionSnapshotError) {
      throw new ConfigurationError([definitionsVersionVariable]);
    }
    throw error;
  }
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
 * @throws ConfigurationError when a binding or a secret is missing, or `HALONIC_DEFINITIONS_VERSION` is set but malformed; the message names them, never a value
 *
 * @param env - the Worker's bindings and secrets
 * @param options - the scope of the request's principal, or of a test
 *
 * @example
 * const runtime = await createRuntime(env);
 * await runtime.watchdog.sweep();
 */
export async function createRuntime(
  env: RuntimeEnv,
  options: RuntimeOptions = {},
): Promise<Runtime> {
  const missing = await missingConfiguration(env);
  if (missing.length > 0) {
    throw new ConfigurationError(missing);
  }
  return buildRuntime(env, options);
}

/**
 * Wires the adapters like {@link createRuntime}, without checking the configuration again, so a
 * runtime can be built for each request once the deployment was checked.
 *
 * @throws ConfigurationError when `HALONIC_DEFINITIONS_VERSION` is set but malformed
 */
export function buildRuntime(env: RuntimeEnv, options: RuntimeOptions = {}): Runtime {
  const { scope } = options;
  const clock: Clock = { now: () => new Date() };
  const secrets = workerSecrets(env);
  const records = new D1RecordStore(env.DB, { scope: scope ?? "" });
  const runs = new D1RunList(env.DB, { scope: scope ?? "" });
  const ownership = new D1RunOwnership(env.DB, { scope: scope ?? "" });
  const definitions = definitionsOf(env, options);
  // Every run object of the scope is named under this prefix; empty when unscoped.
  const namePrefix = scope === undefined ? "" : scopedKeyPrefix(scope);
  const scheduler = new DurableScheduler({
    namespace: env.RUN,
    namePrefix,
  });
  return {
    clock,
    secrets,
    records,
    runs,
    ownership,
    runStore: new DurableRunStore({
      namespace: env.RUN,
      runList: runs,
      namePrefix,
    }),
    runEvents: new DurableRunEvents({
      namespace: env.RUN,
      namePrefix,
    }),
    blobs: new R2BlobStore(env.BLOBS, scope === undefined ? undefined : scopedKeyPrefix(scope)),
    definitions,
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
