// Which provider each harness agent's bridge reaches from the Studio
// (HAL-12488), as the CLI's `harness-bridge-keys.ts` decides it: the
// program's own sign-in, or, for an agent whose file's `model` is an alias of
// the workspace's models, that alias's provider with its key. The key check
// is workspace-models' `harnessModelAccess`, the one the built-in loop's
// calls get, so a key goes to the same places from a harness agent as from
// any other model call in the Studio.

import type { BridgeAgent, BridgeServices } from "@halonicjs/adapter-agent-host-client";
import { harnessModelAccess, harnessProviderModel } from "@halonicjs/adapter-workspace-models";
import type { HarnessModelNames } from "@halonicjs/engine";
import {
  type DefinitionSource,
  noKeyOrigins,
  type Secrets,
  workspaceSecrets,
} from "@halonicjs/ports";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";

/** What {@link studioHarnessKeys} reads. */
export interface StudioHarnessKeysInput {
  /** The workspace's files, read as they are saved now, as the agents' files are. */
  readonly definitions: DefinitionSource;
  /** The keychain, as `Secrets`. */
  readonly secrets: Secrets;
  /** Whether a person trusted exactly these files on this computer, as the engine's model calls ask. */
  isTrusted(workspace: LoadedWorkspace): Promise<boolean>;
}

/** The providers and prices of one agent's bridge. */
export type BridgeAccess = Pick<BridgeServices, "providers" | "prices">;

/** What the harness host gets: each bridge's access, the keys it reads and the engine's model names. */
export interface StudioHarnessKeys {
  accessOf(agent: BridgeAgent): Promise<BridgeAccess>;
  /**
   * The keychain as a bridge reads it: only a name a workspace file may
   * name. `AgentHostBridges` narrows it further to the names that bridge's
   * own access gives, so a bridge reads no other key.
   */
  readonly secrets: Secrets;
  readonly models: HarnessModelNames;
}

/** What an agent with no alias gets: the program's own sign-in for both providers, which Halonic never reads. */
const signIn: BridgeAccess = {
  providers: { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } },
  prices: {},
};

/**
 * The Studio's keys for its harness agents (requirement
 * `studio.harness-bridge-keys`). An agent whose file's `model` is an alias
 * gets the alias's provider on the bridge route its API is served on, and no
 * other route, after the same key check as the engine's model calls; every
 * other agent gets the program's own sign-in for both. The desktop keychain
 * keeps no origin list yet, so its keys stay on the trust rule, as the
 * engine's do.
 *
 * @example
 * const keys = studioHarnessKeys({ definitions, secrets, isTrusted });
 * await keys.accessOf({ runId, agentId: "coder", harness: "claude-code", hubId: "support", model: "open-coder-agent" });
 */
export function studioHarnessKeys(input: StudioHarnessKeysInput): StudioHarnessKeys {
  return {
    accessOf: async (agent) => accessOf(input, agent),
    secrets: workspaceSecrets(input.secrets),
    models: {
      providerModelOf: async (hubId, name) =>
        harnessProviderModel(await loadWorkspace(input.definitions), hubId, name),
    },
  };
}

/**
 * The agent's providers and prices: its alias's provider with the key, at its
 * `baseUrl`, and its price under the route, or sign-in when its file names
 * no alias.
 *
 * @throws what `harnessModelAccess` throws, so the run fails with the reason
 */
async function accessOf(input: StudioHarnessKeysInput, agent: BridgeAgent): Promise<BridgeAccess> {
  if (agent.hubId === undefined || agent.model === undefined) return signIn;
  const workspace = await loadWorkspace(input.definitions);
  const access = await harnessModelAccess(workspace, agent.hubId, agent.model, agent.harness, {
    isTrusted: () => input.isTrusted(workspace),
    keyOrigins: noKeyOrigins,
  });
  if (access === undefined) return signIn;
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
  };
}
