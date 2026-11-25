import { type Principal, type Scope, type ScopedRunPorts, scopeName } from "@halonicjs/host-server";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { buildRuntime, missingConfiguration, type Runtime } from "./runtime.ts";
import { workerRuns } from "./worker-runs.ts";

/**
 * The runtime of one scope, built for each request from `principal.scope`. Its blobs go under
 * `scopePrefix(scope)` in R2, its run objects are named under that prefix, its run list keeps
 * its rows under the scope's name, and its coordination and routines objects are the scope's
 * own. The definitions stay the deployment's: every scope runs the workspace the deployer
 * uploaded, and an `R2DefinitionSource` only reads, so no route of a scope writes to
 * `DEFINITIONS`.
 *
 * The deployment's configuration must have been checked already ({@link createScopedRuns} does).
 *
 * @throws ConfigurationError when `HALONIC_DEFINITIONS_VERSION` is set but malformed
 */
export function scopedRuntime(env: RuntimeEnv, scope: Scope): Runtime {
  return buildRuntime(env, { scope: scopeName(scope), sharedDefinitions: true });
}

/**
 * The `scopedRuns` hook of `host/server`'s `ManyUserPorts`: for each principal, the run executor
 * run store and run ownership of its scope's runtime, and nothing another scope can reach. It checks the
 * deployment's configuration once, here, so a request never builds ports of a broken one.
 *
 * @throws ConfigurationError when a binding or a secret is missing
 *
 * @example
 * const scopedRuns = await createScopedRuns(env);
 * const { runs, runStore } = scopedRuns(principal);
 */
export async function createScopedRuns(
  env: RuntimeEnv,
): Promise<(principal: Principal) => ScopedRunPorts> {
  const missing = await missingConfiguration(env);
  if (missing.length > 0) {
    throw new ConfigurationError(missing);
  }
  return (principal) => {
    const runtime = scopedRuntime(env, principal.scope);
    return {
      runs: workerRuns(runtime),
      runStore: runtime.runStore,
      ownership: runtime.ownership,
    };
  };
}
