// What each harness agent's bridge serves in the CLI (HAL-12488): the
// program's own sign-in, or, for an agent whose file's `model` is an alias of
// the workspace's models, that alias's provider with its key. The key check
// is workspace-models' `harnessModelAccess`, the same one the built-in loop's
// calls get, so a key goes to the same places from a harness agent as from
// any other model call.

import {
  type HarnessAccessChecks,
  harnessModelAccess,
  harnessProviderModel,
} from "@halonicjs/adapter-workspace-models";
import type { HarnessModelNames } from "@halonicjs/engine";
import {
  type BridgeAgent,
  type BridgeServices,
  type BridgeServicesSource,
  refusingApprovals,
} from "@halonicjs/host-harness-host";
import { type KeyOrigins, type Secrets, workspaceSecrets } from "@halonicjs/ports";
import type { LoadedWorkspace } from "@halonicjs/workspace";

/** What {@link harnessBridgeKeys} reads. */
export interface HarnessKeysInput {
  /** The files the engine runs, read when a bridge opens: models and providers from the latest version. */
  workspace(): LoadedWorkspace;
  /** The CLI's remembered secrets, never a raw adapter (`apps/cli/AGENTS.md`). */
  readonly secrets: Secrets;
  /** The origins each stored key may be sent to, from the profile's secrets file. */
  readonly keyOrigins: KeyOrigins;
  /** Whether the command's trust check granted trust, as the model resolver is told. */
  readonly trusted: boolean;
}

/** The three parts the harness host gets: the bridge's services, its secrets and the engine's model names. */
export interface HarnessBridgeKeys {
  readonly services: BridgeServicesSource;
  /** The secrets the bridge reads keys from: only those an opened bridge was given, never Halonic's own. */
  readonly secrets: Secrets;
  readonly models: HarnessModelNames;
}

/**
 * The bridge services, secrets and model names for the CLI's harness agents
 * (requirement `cli.harness-bridge-keys`).
 *
 * An agent whose file's `model` is an alias gets the alias's provider on the
 * bridge route its API is served on, and no other; every other agent gets the
 * program's own sign-in for both, as before. The bridge's secrets give a key
 * only by a name a bridge was given, and only a name a workspace file may
 * name, so a key the CLI remembers for anything else never reaches it.
 *
 * @example
 * const keys = harnessBridgeKeys({ workspace, secrets, keyOrigins, trusted });
 * harnessHostOf({ ..., services: keys.services, models: keys.models });
 * new NodeHarnessBridgeServer({ secrets: keys.secrets, ... });
 */
export function harnessBridgeKeys(input: HarnessKeysInput): HarnessBridgeKeys {
  const given = new Set<string>();
  const fileSecrets = workspaceSecrets(input.secrets);
  const checks: HarnessAccessChecks = {
    isTrusted: () => input.trusted,
    keyOrigins: input.keyOrigins,
  };
  return {
    services: {
      servicesFor: async (agent) => {
        const services = await keyedServices(input.workspace(), agent, checks);
        for (const access of Object.values(services.providers)) {
          if (access?.kind === "key") given.add(access.secret);
        }
        return services;
      },
    },
    secrets: {
      get: async (name) => (given.has(name) ? await fileSecrets.get(name) : null),
    },
    models: {
      providerModelOf: async (hubId, name) => harnessProviderModel(input.workspace(), hubId, name),
    },
  };
}

/** No Halonic tools yet: each tool name the program asks for is refused with its own error. */
const noTools: BridgeServices["tools"] = {
  list: async () => [],
  check: async (name) => ({ kind: "refused", reason: `${name} isn't a tool of this agent.` }),
  call: async (name) => ({ result: `${name} isn't a tool of this agent.`, outcome: "error" }),
};

/**
 * What an agent with no alias gets: the program's own sign-in for both
 * providers, which Halonic never reads and spends nothing on; no Halonic
 * tools; and approvals that refuse every request, so a call that needs a
 * person fails with its own error.
 */
const signInServices: BridgeServices = {
  providers: { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } },
  prices: {},
  tools: noTools,
  approvals: refusingApprovals,
};

/**
 * The agent's services: its alias's provider with the key, at its `baseUrl`,
 * and its price under the route, or the sign-in services when its file names
 * no alias.
 *
 * @throws what `harnessModelAccess` throws, so the run fails with the reason
 */
async function keyedServices(
  workspace: LoadedWorkspace,
  agent: BridgeAgent,
  checks: HarnessAccessChecks,
): Promise<BridgeServices> {
  if (agent.hubId === undefined || agent.model === undefined) return signInServices;
  const access = await harnessModelAccess(workspace, agent.hubId, agent.model, checks);
  if (access === undefined) return signInServices;
  return {
    providers: {
      [access.route]: {
        kind: "key",
        secret: access.secret,
        providerId: access.providerId,
        ...(access.baseUrl === undefined ? {} : { baseUrl: access.baseUrl }),
      },
    },
    prices: access.price === undefined ? {} : { [access.route]: { [access.model]: access.price } },
    tools: noTools,
    approvals: refusingApprovals,
  };
}
