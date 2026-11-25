// What a harness step's bridge serves on the Worker (requirement `runtime.worker-bridge-services`):
// the host's shared `ProviderKeyServices`, on the workspace the deployer uploaded. The program in
// the run container is not trusted, so the Worker narrows it in two ways. The bridge reads only
// the secrets a provider file of the deployed workspace names, never the token key or any other
// Workers secret. And no provider is ever reached with the program's own sign-in: a cloud run
// serves many people, and its container holds no sign-in of the deployer's to spend.

import {
  harnessModelAccess,
  harnessProviderModel,
  requireKeyMayGo,
} from "@halonicjs/adapter-workspace-models";
import type { HarnessModelNames } from "@halonicjs/engine";
import {
  type BridgeAgent,
  type BridgeServices,
  type BridgeServicesSource,
  ProviderKeyServices,
} from "@halonicjs/host-harness-host";
import {
  type BridgeProvider,
  type BridgeProviderAccess,
  noKeyOrigins,
  type Secrets,
} from "@halonicjs/ports";
import type { LoadedWorkspace } from "@halonicjs/workspace";

/** What {@link workerBridgeServices} reads. */
export interface WorkerBridgeServicesInput {
  /** The workspace the deployer uploaded, loaded from the snapshot this Worker version serves. */
  readonly workspace: LoadedWorkspace;
  /** The Workers secrets, from `workerSecrets(env)`. */
  readonly secrets: Secrets;
  /** The deployment's name, as a refused agent's message gives it. */
  readonly deployment: string;
}

/** What a run object's harness steps get: the bridge's services, its secrets and its scrub. */
export interface WorkerBridgeServices {
  /** What each agent's bridge serves: only keyed providers, never a sign-in. */
  readonly services: BridgeServicesSource;
  /** The only secrets the bridge server may read: those the workspace's provider files name. */
  readonly bridgeSecrets: Secrets;
  /** Removes every key value the bridge was handed from a text, before the run log gets it. */
  scrub(text: string): string;
  /** Turns an agent's model alias into its provider's model id. */
  readonly models: HarnessModelNames;
}

/** The providers whose access is a key Halonic keeps; a provider left out is refused by the bridge. */
function keyedOnly(
  providers: BridgeServices["providers"],
): Partial<Record<BridgeProvider, BridgeProviderAccess>> {
  return Object.fromEntries(
    Object.entries(providers).filter(([, access]) => access?.kind === "key"),
  );
}

/**
 * The bridge services of the Worker's harness steps.
 *
 * The deployed workspace counts as trusted, as for the Worker's own model calls
 * (`workerModelResolver`): the deployer uploaded its provider files and keys together, and the
 * Workers secrets record no allowed origins.
 *
 * @example
 * const bridge = workerBridgeServices({ workspace, secrets: workerSecrets(env), deployment: "acme" });
 * new WorkerBridgeServer({ secrets: bridge.bridgeSecrets, ... });
 */
export function workerBridgeServices(input: WorkerBridgeServicesInput): WorkerBridgeServices {
  const checks = { trusted: true, keyOrigins: noKeyOrigins };
  const keys = new ProviderKeyServices({
    workspace: () => input.workspace,
    secrets: input.secrets,
    requireKeyMayGo: (file) => requireKeyMayGo(file, checks),
    missingKeyText: (secret, providerId) =>
      `The secret "${secret}" that holds provider ${providerId}'s key isn't set on deployment "${input.deployment}", so the agent can't call its model in the cloud. Set it with halonic deploy, then run the agent again.`,
    aliases: {
      providerModel: harnessProviderModel,
      access: (workspace, hubId, name, harness) =>
        harnessModelAccess(workspace, hubId, name, harness, {
          isTrusted: () => true,
          keyOrigins: noKeyOrigins,
        }),
    },
    manyUsers: { deployment: input.deployment },
  });
  return {
    services: {
      async servicesFor(agent: BridgeAgent): Promise<BridgeServices> {
        const services = await keys.servicesFor(agent);
        return { ...services, providers: keyedOnly(services.providers) };
      },
    },
    bridgeSecrets: keys.bridgeSecrets,
    scrub: keys.scrub,
    models: keys.models,
  };
}
