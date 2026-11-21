// The harness host an open engine runs its harness agents in, with the
// engine's decisions and the parts a sandboxed agent's provider key is served
// from (HAL-13795). The key parts are bound to the workspace the engine loaded
// as its own model calls are, so a harness agent and a model call refuse a key
// alike.

import {
  harnessModelAccess,
  harnessProviderModel,
  requireKeyMayGo,
} from "@halonicjs/adapter-workspace-models";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { EngineServiceOptions } from "./engine-service-options.ts";
import type { EngineDecisions, StudioHarnessHost } from "./studio-harness-host.ts";
import type { StudioKeyParts } from "./studio-provider-keys.ts";

/** The engine options the harness host is opened with. */
export type HarnessHostOptions = Pick<
  EngineServiceOptions,
  "openHarnessHost" | "reportError" | "secrets" | "isTrusted" | "keyOrigins"
>;

/**
 * The harness host, or none when no agent host runs or it can't be reached
 * now. Without one the engine still opens for the workflows that need none,
 * and a run of an agent in a harness fails at its harness step.
 *
 * @example
 * const host = await openEngineHarnessHost(options, workspace, { approvalsOf, remoteDecisionsOf });
 */
export async function openEngineHarnessHost(
  options: HarnessHostOptions,
  workspace: LoadedWorkspace,
  decisions: EngineDecisions,
): Promise<StudioHarnessHost | undefined> {
  try {
    return await options.openHarnessHost?.({
      ...decisions,
      ...engineKeyParts(options, workspace),
    });
  } catch (error) {
    options.reportError(error);
    return undefined;
  }
}

/**
 * The key parts of the workspace the engine loaded: the keychain, and the
 * model calls' checks bound to the workspace's trust and the keys' allowed
 * addresses.
 */
function engineKeyParts(options: HarnessHostOptions, workspace: LoadedWorkspace): StudioKeyParts {
  return {
    workspace: () => workspace,
    secrets: options.secrets,
    requireKeyMayGo: async (file) =>
      requireKeyMayGo(file, {
        trusted: await options.isTrusted(workspace),
        keyOrigins: options.keyOrigins,
      }),
    aliases: {
      providerModel: harnessProviderModel,
      access: async (loaded, hubId, name, harness) =>
        harnessModelAccess(loaded, hubId, name, harness, {
          isTrusted: () => options.isTrusted(loaded),
          keyOrigins: options.keyOrigins,
        }),
    },
  };
}
