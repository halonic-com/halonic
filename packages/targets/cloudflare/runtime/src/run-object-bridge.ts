// The run object's part in a harness step's bridge, apart from `cloudflare:workers` so Node tests
// it (requirement `runtime.run-container-object`).

import { RunCredentials } from "@halonicjs/adapter-harness-bridge/web";
import { systemClock } from "@halonicjs/std";
import type { RuntimeEnv } from "./env.ts";
import { runContainerTimeCapMs } from "./run-container-limits.ts";
import {
  DurableRunCredentialStore,
  type TransactionalCredentialStorage,
} from "./run-credential-storage.ts";
import { WorkerBridgeServer } from "./worker-bridge-server.ts";
import { workerSecrets } from "./worker-secrets.ts";

/**
 * The run id a run object is named after: its name without its scope's prefix. A bridge request
 * is answered for this run alone, never for one the request names.
 *
 * @throws Error when the object has no name, or the name doesn't start with its prefix
 */
export function runIdOfObjectName(name: string | undefined, namePrefix: string | null): string {
  const prefix = namePrefix ?? "";
  if (name === undefined || !name.startsWith(prefix) || name.length === prefix.length) {
    throw new Error("This run object has no run name, so it serves no bridge.");
  }
  return name.slice(prefix.length);
}

/**
 * The bridge server of the harness steps a run object runs: credentials in the object's own
 * storage, lasting the container's time cap at most, and provider keys from the Workers secrets.
 * Its open bridges are kept only in memory: an object evicted while a step runs loses them, and
 * the run's credential then works until it expires at the time cap rather than until it is revoked.
 */
export function runObjectBridgeServer(
  storage: TransactionalCredentialStorage,
  env: Partial<RuntimeEnv>,
): WorkerBridgeServer {
  return new WorkerBridgeServer({
    credentials: new RunCredentials({
      store: new DurableRunCredentialStore(storage),
      clock: systemClock,
    }),
    clock: systemClock,
    lifetimeMs: runContainerTimeCapMs,
    secrets: workerSecrets(env),
    fetch: (input, init) => fetch(input, init),
  });
}
