// What the Studio's engine runs agents in harnesses with (HAL-10849): the
// agent host's parts, reached over its loopback routes. The page has no Node,
// so the sandbox, the harness programs, the bridges, the profile builder, the
// proposal folders and the placement choices all live in the agent host. The
// engine, its recorder, the tools, the approvals and the keys stay here.
//
// Only the fenced sandbox runs agents: the host has no unfenced session yet,
// so an agent the person set to "On this computer" is refused before it
// starts, never run outside the fence.

import {
  AgentHostBridges,
  AgentHostPlacementStore,
  AgentHostProfiles,
  AgentHostProposalFolders,
  AgentHostSandbox,
  type AgentHostTransport,
  agentHostHarnesses,
  type BridgeAgent,
  type BridgeServices,
} from "@halonicjs/adapter-agent-host-client";
import { claudeCodeEnvironment } from "@halonicjs/adapter-harness-claude-code/environment";
import { codexEnvironment } from "@halonicjs/adapter-harness-codex/environment";
import { AgentPlacement } from "@halonicjs/app";
import type { HarnessRunsOptions, RunProposalFolders } from "@halonicjs/engine";
import {
  type AgentFiles,
  FilePlacementPolicy,
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

/** What {@link openStudioHarnessHost} builds from. */
export interface StudioHarnessInput {
  readonly transport: AgentHostTransport;
  /** The workspace folder, which the launcher named to the host. */
  readonly location: string;
  /** The workspace's files, which each agent's file is read from for its placement. */
  readonly definitions: DefinitionSource;
  readonly digest: Digest;
  readonly clock: Clock;
  /**
   * The approvals of one run's bridge, asked when the bridge opens. Called
   * only once the engine is built; `refusingApprovals` until then.
   */
  approvalsOf(runId: string): BridgeApprovals | undefined;
  /** Hears the error of a clean-up at the start that couldn't finish. */
  reportError(error: unknown): void;
}

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
  const bridges = new AgentHostBridges(transport, {
    servicesFor: (agent) => bridgeServicesOf(agent, input),
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
      home: null,
    },
    proposalFolders,
    start: async (openRuns) => {
      // Clean-up only: the engine opens all the same, and the next one tries again.
      await proposalFolders.start(openRuns).catch(input.reportError);
    },
  };
}

/**
 * What each agent's bridge serves, as the CLI's does: the program's own
 * sign-in for both providers, so no key passes through, and no Halonic
 * tools. Its approvals are the engine's for the agent's run, which a card
 * and a phone decide; until the engine is built, they refuse every request.
 */
function bridgeServicesOf(agent: BridgeAgent, input: StudioHarnessInput): BridgeServices {
  return {
    providers: { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } },
    prices: {},
    tools: {
      list: async () => [],
      check: async (name) => ({ kind: "refused", reason: `${name} isn't a tool of this agent.` }),
      call: async (name) => ({ result: `${name} isn't a tool of this agent.`, outcome: "error" }),
    },
    approvals: input.approvalsOf(agent.runId) ?? refusingApprovals,
    secrets: { get: async () => null },
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

/** Why an agent set to "On this computer" doesn't start from the Studio. */
const noUnfencedReason =
  "Halonic can't run Claude Code or Codex agents outside the sandbox yet. Set this agent back to the sandbox.";

/**
 * The `this-computer` sandbox of the Studio: none. Its check says why, and
 * opening a session throws, so the run fails before the program starts.
 */
const noUnfencedSandbox: Sandbox = {
  check: async () => ({ ok: false, reason: "other", missing: [noUnfencedReason] }),
  capabilities: () => ({ files: "shared", strength: "none" }),
  open: async (): Promise<SandboxSession> => {
    throw new Error(noUnfencedReason);
  },
};
