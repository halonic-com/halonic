// What the Studio's engine runs agents in harnesses with (HAL-10849): the
// agent host's parts, reached over its loopback routes. The page has no Node,
// so the sandbox, the harness programs, the bridges, the profile builder, the
// proposal folders and the placement choices all live in the agent host. The
// engine, its recorder, the tools, the approvals and the keys stay here.
// A run's instructions are written in the host too, but whether a person
// trusted them is checked here, against the shell's own records.
//
// Only the fenced sandbox runs agents: the host has no unfenced session yet,
// so an agent the person set to "On this computer" is refused before it
// starts, never run outside the fence.
//
// A sandboxed agent's bridge gets a provider key Halonic keeps, as in the
// CLI (`studio-provider-keys.ts`). The agent host reads its value from here
// when a call needs it, and both sides scrub it out of the bridge's failures.

import {
  AgentHostBridges,
  AgentHostInstructions,
  AgentHostPlacementStore,
  AgentHostProfiles,
  AgentHostProposalFolders,
  AgentHostSandbox,
  type AgentHostTransport,
  agentHostHarnesses,
  type BridgeAgent,
  type BridgeServices,
  type RemoteDecisions,
} from "@halonicjs/adapter-agent-host-client";
import { claudeCodeEnvironment } from "@halonicjs/adapter-harness-claude-code/environment";
import { codexEnvironment } from "@halonicjs/adapter-harness-codex/environment";
import { AgentPlacement, type InstructionTrustService } from "@halonicjs/app";
import type { HarnessAgent, HarnessRunsOptions, RunProposalFolders } from "@halonicjs/engine";
import {
  type AgentFiles,
  FilePlacementPolicy,
  type ProviderKeyServices,
  refusingApprovals,
} from "@halonicjs/host-harness-host";
import type {
  BridgeApprovals,
  Clock,
  DefinitionSource,
  Digest,
  Sandbox,
  SandboxSession,
} from "@halonicjs/ports";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { type StudioKeyParts, studioProviderKeys } from "./studio-provider-keys.ts";

/** What {@link openStudioHarnessHost} builds from. */
export interface StudioHarnessInput extends StudioKeyParts {
  readonly transport: AgentHostTransport;
  /** The workspace folder, which the launcher named to the host. */
  readonly location: string;
  /** The workspace's files, which each agent's file is read from for its placement. */
  readonly definitions: DefinitionSource;
  readonly digest: Digest;
  readonly clock: Clock;
  /** The person's trusted instructions, which the shell keeps; a run whose instructions aren't trusted doesn't start. */
  readonly instructionTrust: Pick<InstructionTrustService, "check">;
  /**
   * The approvals of one run's bridge, asked when the bridge opens. Called
   * only once the engine is built; `refusingApprovals` until then.
   */
  approvalsOf(runId: string): BridgeApprovals | undefined;
  /**
   * Takes the decisions a phone makes on one run's bridge questions into the
   * same approvals. Called only once the engine is built; until then, and
   * when it gives none, a phone's decision is refused.
   */
  remoteDecisionsOf(runId: string): RemoteDecisions | undefined;
  /** Hears the error of a clean-up at the start that couldn't finish. */
  reportError(error: unknown): void;
}

/** What the engine gives the harness host once it is built: one run's approvals and its phone's decisions. */
export type EngineDecisions = Pick<StudioHarnessInput, "approvalsOf" | "remoteDecisionsOf">;

/** What the engine gives the harness host when it opens: its decisions, and its parts for a sandboxed agent's key. */
export type EngineParts = EngineDecisions & StudioKeyParts;

/** What the engine gets: `harnesses` and `proposalFolders` go to `runs` of the executor. */
export interface StudioHarnessHost {
  readonly harnesses: HarnessRunsOptions;
  readonly proposalFolders: RunProposalFolders;
  /**
   * Clears what runs that ended while no engine was open left in the host,
   * keeping the folders of `openRuns`. Call it once, before the engine starts
   * any run. It never throws: an error goes to `reportError`, and the next
   * open tries again.
   */
  start(openRuns: ReadonlySet<string>): Promise<void>;
}

/** Each harness's own environment function, run in the page, by harness id. */
const environments = { "claude-code": claudeCodeEnvironment, codex: codexEnvironment };

/**
 * Builds the Studio's harness host on the agent host. It asks the host for
 * its sandbox's capabilities and its harnesses, so it fails when the host
 * can't be reached, and the engine doesn't open.
 *
 * @throws {@link AgentHostError} when the host refuses or can't be reached
 */
export async function openStudioHarnessHost(input: StudioHarnessInput): Promise<StudioHarnessHost> {
  const { transport, location } = input;
  const keys = studioProviderKeys(input);
  const bridges = new AgentHostBridges(transport, {
    servicesFor: (agent) => bridgeServicesOf(agent, input, keys),
    scrub: keys.scrub,
  });
  const bridgeIdOf = bridges.idOf.bind(bridges);
  const proposalFolders = new AgentHostProposalFolders(transport, location);
  const listed = await agentHostHarnesses(transport, { bridgeIdOf, environments });
  const placement = new FilePlacementPolicy({
    reader: new AgentPlacement({
      store: new AgentHostPlacementStore(transport),
      digest: input.digest,
      clock: input.clock,
    }),
    files: agentFilesOf(input.definitions),
    location,
  });
  return {
    harnesses: {
      placement,
      sandboxes: {
        sandbox: await AgentHostSandbox.connect(transport),
        "this-computer": noUnfencedSandbox,
      },
      harnesses: Object.fromEntries(listed.map((harness) => [harness.id, harness])),
      bridges,
      profiles: new AgentHostProfiles(transport, { workspace: location, bridgeIdOf }),
      instructions: new AgentHostInstructions(transport, {
        workspace: location,
        skillTextOf: (agent, id) => skillTextOf(input.definitions, agent.hubId, id),
      }),
      instructionTrust: { service: input.instructionTrust, location },
      home: null,
      // An alias's model, read from the same files as the agent's bridge (HAL-12488).
      models: keys.models,
    },
    proposalFolders,
    start: async (openRuns) => {
      // Clean-up only: the engine opens all the same, and the next one tries again.
      await proposalFolders.start(openRuns).catch(input.reportError);
    },
  };
}

/**
 * What each agent's bridge serves, as the CLI's does: the provider access
 * `keys` decides, a key Halonic keeps for an agent in the sandbox, with its
 * prices, and no Halonic tools. Its approvals are the engine's for the
 * agent's run, which a card and a phone decide; until the engine is built,
 * they refuse every request, and a phone's decision is refused.
 *
 * @throws what `keys.servicesFor` throws, before the bridge opens, so the program never starts
 */
async function bridgeServicesOf(
  agent: BridgeAgent,
  input: StudioHarnessInput,
  keys: ProviderKeyServices,
): Promise<BridgeServices> {
  const served = await keys.servicesFor(agent);
  const remoteDecisions = input.remoteDecisionsOf(agent.runId);
  return {
    ...served,
    approvals: input.approvalsOf(agent.runId) ?? refusingApprovals,
    ...(remoteDecisions === undefined ? {} : { remoteDecisions }),
    secrets: keys.bridgeSecrets,
  };
}

/**
 * The agents' files as they are saved now: the Studio starts its runs on the
 * saved files. The text goes back to UTF-8, the bytes a choice was made for.
 */
function agentFilesOf(definitions: DefinitionSource): AgentFiles {
  return {
    bytesOf: async (hubId, agentId) => {
      const workspace = await loadWorkspace(definitions);
      const file = filesOf(workspace, "agent").find(
        (each) => each.hub === hubId && each.value.id === agentId,
      );
      const text = file === undefined ? null : await definitions.read(file.path);
      if (text === null) throw new Error(`Hub "${hubId}" has no agent "${agentId}".`);
      return new TextEncoder().encode(text);
    },
  };
}

/**
 * A skill's `SKILL.md` as it is saved now, as the agent's hub sees it: the
 * hub's own, else the workspace's shared one, as the CLI reads it.
 *
 * @throws when the workspace has no such skill
 */
async function skillTextOf(
  definitions: DefinitionSource,
  hubId: HarnessAgent["hubId"],
  skillId: string,
): Promise<string> {
  const named = filesOf(await loadWorkspace(definitions), "skill").filter(
    (file) => file.value.id === skillId,
  );
  const file = named.find((each) => each.hub === hubId) ?? named.find((each) => each.hub === null);
  const text = file === undefined ? null : await definitions.read(file.path);
  if (text === null) throw new Error(`The workspace has no skill "${skillId}".`);
  return text;
}

/** Why an agent set to "On this computer" doesn't start from the Studio. */
const noUnfencedReason =
  "Halonic can't run Claude Code or Codex agents outside the sandbox yet. Set this agent back to the sandbox.";

/**
 * The `this-computer` sandbox of the Studio: none. Its check says why, and
 * opening a session throws, so the run fails before the program starts.
 */
const noUnfencedSandbox: Sandbox = {
  check: async () => ({ ok: false, reason: "not-offered", missing: [noUnfencedReason] }),
  capabilities: () => ({ files: "shared", strength: "none" }),
  open: async (): Promise<SandboxSession> => {
    throw new Error(noUnfencedReason);
  },
};
