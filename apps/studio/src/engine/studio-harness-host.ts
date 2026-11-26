// What the Studio's engine runs agents in harnesses with (HAL-10849): the
// agent host's parts, reached over its loopback routes. The page has no Node,
// so the sandbox, the harness programs, the bridges, the profile builder, the
// proposal folders and the placement choices all live in the agent host. The
// engine, its recorder, the tools, the approvals and the keys stay here.
// A run's instructions are written in the host too, but whether a person
// trusted them is checked here, against the shell's own records.
//
// An agent the person set to "On this computer" runs in the host's session
// without the sandbox (HAL-13195), which the host opens only once its own
// gate passes: a trusted workspace, the person's choice for the agent's
// saved file and a profile the host built. Where the host offers no such
// session, the run is refused before it starts, never run outside the fence.
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
  AgentHostThisComputer,
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
import type { BridgeApprovals, Clock, DefinitionSource, Digest } from "@halonicjs/ports";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { RunVersionLoads } from "./page-run-versions.ts";
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
   * The approvals of one run's bridge, asked when the bridge opens: the
   * bridge of the attempt `attemptId` names, when the engine opened it with
   * one (HAL-19425). Called only once the engine is built; `refusingApprovals` until then.
   */
  approvalsOf(runId: string, attemptId?: string): BridgeApprovals | undefined;
  /**
   * Takes the decisions a phone makes on one run's bridge questions into the
   * same approvals. Called only once the engine is built; until then, and
   * when it gives none, a phone's decision is refused.
   */
  remoteDecisionsOf(runId: string): RemoteDecisions | undefined;
  /**
   * The version each run read, which its agent's file comes from for its placement. Left out,
   * every agent's file is read as saved now.
   */
  readonly runVersions?: RunVersionLoads;
  /** Hears the error of a clean-up at the start that couldn't finish. */
  reportError(error: unknown): void;
}

/** What the engine gives the harness host once it is built: one run's approvals and its phone's decisions. */
export type EngineDecisions = Pick<
  StudioHarnessInput,
  "approvalsOf" | "remoteDecisionsOf" | "runVersions"
>;

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
    files: agentFilesOf(input.definitions, input.runVersions),
    location,
  });
  const profiles = new AgentHostProfiles(transport, { workspace: location, bridgeIdOf });
  return {
    harnesses: {
      placement,
      sandboxes: {
        sandbox: await AgentHostSandbox.connect(transport),
        "this-computer": await AgentHostThisComputer.connect(transport, {
          workspace: location,
          agentOf: (profile) => profiles.agentOf(profile),
        }),
      },
      harnesses: Object.fromEntries(listed.map((harness) => [harness.id, harness])),
      bridges,
      profiles,
      instructions: new AgentHostInstructions(transport, {
        workspace: location,
        skillTextOf: (agent, id) => skillTextOf(input.definitions, input.runVersions, agent, id),
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
    approvals: input.approvalsOf(agent.runId, agent.attemptId) ?? refusingApprovals,
    ...(remoteDecisions === undefined ? {} : { remoteDecisions }),
    secrets: keys.bridgeSecrets,
  };
}

/**
 * The agents' files as the version each run read has them, or as saved now without
 * `runVersions`: the bytes a run's placement choice is read for.
 *
 * @example
 * const files = agentFilesOf(store, runVersions);
 * await files.bytesOf("support", "writer", { runId: "run_1", version });
 */
export function agentFilesOf(
  definitions: DefinitionSource,
  runVersions: RunVersionLoads | undefined,
): AgentFiles {
  return {
    bytesOf: async (hubId, agentId, run) => {
      if (runVersions === undefined) return savedAgentBytes(definitions, hubId, agentId);
      const { workspace, fileTexts } = await runVersions.loadedOf(run);
      const file = filesOf(workspace, "agent").find(
        (each) => each.hub === hubId && each.value.id === agentId,
      );
      const text = file === undefined ? undefined : fileTexts.get(file.path);
      if (text === undefined) throw new Error(`Hub "${hubId}" has no agent "${agentId}".`);
      return new TextEncoder().encode(text);
    },
  };
}

/**
 * An agent's file as it is saved now, its text back in UTF-8: the bytes a
 * placement choice is made for. The engine and the Harness page both read
 * these, so the page sees the engine's choice.
 *
 * @throws when the hub has no such agent
 */
export async function savedAgentBytes(
  definitions: DefinitionSource,
  hubId: string,
  agentId: string,
): Promise<Uint8Array> {
  const { text } = await savedAgentFile(definitions, hubId, agentId);
  return new TextEncoder().encode(text);
}

/**
 * An agent's file as it is saved now: its path from the workspace folder and
 * its text.
 *
 * @throws when the hub has no such agent
 */
export async function savedAgentFile(
  definitions: DefinitionSource,
  hubId: string,
  agentId: string,
): Promise<{ readonly path: string; readonly text: string }> {
  const workspace = await loadWorkspace(definitions);
  const file = filesOf(workspace, "agent").find(
    (each) => each.hub === hubId && each.value.id === agentId,
  );
  const text = file === undefined ? null : await definitions.read(file.path);
  if (file === undefined || text === null) {
    throw new Error(`Hub "${hubId}" has no agent "${agentId}".`);
  }
  return { path: file.path, text };
}

/**
 * A skill's `SKILL.md` as the version the agent's run read has it, or as saved now without
 * `runVersions`, as the agent's hub sees it: the hub's own, else the workspace's shared one, as
 * the CLI reads it. So the agent's file and its skills in one pin come from one version; a chat
 * turn, which reads no version, gets the saved files.
 *
 * @throws when that version has no such skill
 */
async function skillTextOf(
  definitions: DefinitionSource,
  runVersions: RunVersionLoads | undefined,
  agent: Pick<HarnessAgent, "runId" | "version" | "hubId">,
  skillId: string,
): Promise<string> {
  let text: string | null | undefined;
  if (runVersions === undefined) {
    const file = skillFileOf(await loadWorkspace(definitions), agent.hubId, skillId);
    text = file === undefined ? null : await definitions.read(file.path);
  } else {
    const { workspace, fileTexts } = await runVersions.loadedOf(agent);
    const file = skillFileOf(workspace, agent.hubId, skillId);
    text = file === undefined ? null : fileTexts.get(file.path);
  }
  if (text === null || text === undefined) {
    throw new Error(`The workspace has no skill "${skillId}".`);
  }
  return text;
}

/** The skill file the hub sees: its own, else the workspace's shared one. */
function skillFileOf(workspace: LoadedWorkspace, hubId: string, skillId: string) {
  const named = filesOf(workspace, "skill").filter((file) => file.value.id === skillId);
  return named.find((each) => each.hub === hubId) ?? named.find((each) => each.hub === null);
}
