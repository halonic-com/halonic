// What the page can't start, known from the workspace's files before anything starts: an agent
// that lists a connector the agent host can't start, every one where none runs (HAL-10236) and
// any but a `stdio` one of its hub where it does (HAL-13344), or one in a harness program where no
// agent host runs (HAL-10849). The engine refuses it when asked to start, and the Workflows page
// reads it before **Run** is pressed, so **Run** is unavailable with the same lines under it
// (rules N1, N2, N3 and N5 of the UX check, HAL-12363).

import {
  startsAProgram,
  type WorkflowRef,
  workflowAgentsOf,
} from "@halonicjs/adapter-workspace-models";
import type { Agent } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import { StartRefused } from "@halonicjs/studio-feature-workflows/api";
import { definitionsOf, filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { harnessName } from "../studio/harness-name.ts";

/** What the page can start, besides the engine's own steps. */
export interface PageRuns {
  /** Whether an agent host runs the agents in a harness program. */
  readonly runsHarnesses: boolean;
  /** Whether the agent host starts a run's `stdio` connectors of the agent's hub. */
  readonly startsConnectors: boolean;
}

/**
 * Why the page can't start the workflow's run, with the next step, or `undefined` when nothing in
 * the files stops it. Names the first agent that stops it.
 */
export function workflowRefusalOf(
  workspace: LoadedWorkspace,
  run: WorkflowRef,
  runs: PageRuns,
): StartRefused | undefined {
  for (const { value: agent } of workflowAgentsOf(workspace, run)) {
    const refusal = whyThePageCantStart(workspace, run.hubId, agent, runs);
    if (refusal !== undefined) return withNextStep(refusal, agent, runCommandOf(workspace, run));
  }
  return undefined;
}

/**
 * Why the page can't start the agent on its own, as a routine does, or `undefined` when it can: a
 * {@link WindowCantStart} with the Harness page step for an agent in a harness program, and with no
 * next step for one that lists a connector, because `halonic run` starts no single agent.
 */
export function agentRefusalOf(
  workspace: LoadedWorkspace,
  hubId: string,
  agent: Agent,
  runs: PageRuns,
): WindowCantStart | undefined {
  const refusal = whyThePageCantStart(workspace, hubId, agent, runs);
  if (refusal === undefined) return undefined;
  return refusal.inHarness
    ? new WindowCantStart(refusal.reason, harnessPageStep(agent))
    : new WindowCantStart(refusal.reason);
}

/** Why the page can't start an agent (rule N1 of the UX check, HAL-12363). */
interface PageRefusal {
  readonly reason: string;
  /** Whether the agent runs in a harness program, which its Harness page can change. */
  readonly inHarness: boolean;
}

/**
 * The page's refusal of an agent it can't start: `unavailable`, like an engine that can't be
 * reached, but its own class, so a caller tells "this window can't start it" from "the engine
 * isn't answering" and shows its words (HAL-12649). A workflow's refusal, with its next step, is
 * {@link StartRefused} instead.
 */
export class WindowCantStart extends KindedError {
  constructor(reason: string, fix?: string) {
    super("unavailable", reason, fix === undefined ? {} : { fix });
  }
}

/**
 * Why the page can't start an agent in a harness program, when it runs no agent host, or one
 * that lists a connector it can't start; `undefined` when it can.
 */
function whyThePageCantStart(
  workspace: LoadedWorkspace,
  hubId: string,
  agent: Agent,
  { runsHarnesses, startsConnectors }: PageRuns,
): PageRefusal | undefined {
  if (agent.harness !== undefined && startsAProgram(agent.harness) && !runsHarnesses) {
    const program = harnessName(agent.harness);
    return {
      reason: `${agent.name} runs in ${program}, which Halonic can't start yet.`,
      inHarness: true,
    };
  }
  if (!startsConnectors) {
    if (agent.connectors.length > 0) {
      return {
        reason: `${agent.name} uses a connector, which Studio can't start yet.`,
        inHarness: false,
      };
    }
    return undefined;
  }
  const { connectors } = definitionsOf(workspace, hubId);
  const unstartable = agent.connectors.find((id) => {
    const connector = Object.hasOwn(connectors, id) ? connectors[id] : undefined;
    return connector === undefined || !("stdio" in connector.transport);
  });
  if (unstartable !== undefined) {
    return {
      reason: `${agent.name} uses the connector "${unstartable}", which Studio can't start yet.`,
      inHarness: false,
    };
  }
  return undefined;
}

/**
 * The refusal with its next step. A step in Studio wins over a command (rule N3): an agent in a
 * harness program can be set to Halonic on its Harness page, which the page then starts (Sofia,
 * HAL-12368, with Elena's words from HAL-12642). A connector only a terminal can start, with the
 * command that starts the run there (rule N2).
 */
function withNextStep(
  { reason, inHarness }: PageRefusal,
  agent: Agent,
  runCommand: string,
): StartRefused {
  return inHarness
    ? new StartRefused({ reason, fix: harnessPageStep(agent) })
    : new StartRefused({
        reason,
        fix: "To start it, run this in a terminal:",
        command: runCommand,
      });
}

/** The step in Studio that lets the page start an agent in a harness program. */
function harnessPageStep(agent: Agent): string {
  return `Set ${agent.name} to Halonic on its Harness page to run it now.`;
}

/** `halonic run reply`, or `halonic run acme/reply` when another hub has a `reply` too, as the workflow page writes it. */
function runCommandOf(workspace: LoadedWorkspace, { hubId, workflowId }: WorkflowRef): string {
  const inSeveralHubs = filesOf(workspace, "workflow").some(
    (file) => file.value.id === workflowId && file.hub !== null && file.hub !== hubId,
  );
  return inSeveralHubs ? `halonic run ${hubId}/${workflowId}` : `halonic run ${workflowId}`;
}
