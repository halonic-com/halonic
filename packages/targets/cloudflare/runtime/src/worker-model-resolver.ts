// The model resolver of the Worker's engine (HAL-13210, part b2): the same `hubModelResolver`
// `halonic serve` and the desktop Studio use, on the hub definitions the deployer wrote into the
// snapshot's index, so a model call on Cloudflare picks the model, the fallbacks, the key and the
// price a call on a laptop does.

import { hubModelResolver } from "@halonicjs/adapter-workspace-models";
import type { LocalExecutorOptions } from "@halonicjs/engine";
import { type HttpClient, noKeyOrigins, type Secrets } from "@halonicjs/ports";
import { indexedHub, type RunDefinitionsIndexReader } from "./indexed-run-definitions.ts";

/** What {@link workerModelResolver} reads. */
export interface WorkerModelResolverInput {
  /** The snapshot's index, from `cachedRunDefinitionsIndex`. */
  readonly readIndex: RunDefinitionsIndexReader;
  /** The Workers secrets, from `workerSecrets(env)`: the provider keys the deployer set. */
  readonly secrets: Secrets;
  /** How a provider is called; the Worker's own `fetch` by default. */
  readonly http?: HttpClient;
}

/**
 * Picks the model of each call on the Worker from the deployed hub's definitions.
 *
 * The workspace counts as trusted: the deployer chose to deploy it, and uploaded its provider
 * files and keys together, as trusting a workspace on a computer does. So a provider file's key
 * may go to the address that file names, as on a computer the deployer trusts. The Workers
 * secrets record no allowed origins, so no list narrows that (`noKeyOrigins`).
 *
 * @example
 * resolveModel: workerModelResolver({ readIndex, secrets: workerSecrets(env) }),
 */
export function workerModelResolver(
  input: WorkerModelResolverInput,
): LocalExecutorOptions["resolveModel"] {
  return hubModelResolver({
    definitionsOf: (hubId) => indexedHub(input.readIndex, hubId),
    secrets: input.secrets,
    // Bound, so workerd calls `fetch` with the global object as `this`.
    http: input.http ?? { fetch: (url, init) => fetch(url, init) },
    isTrusted: () => true,
    keyOrigins: noKeyOrigins,
  });
}
