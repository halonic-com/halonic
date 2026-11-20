// What the page can't start, known from the workspace's files: an agent that lists a connector
// (HAL-10236), or one in a harness program where no agent host runs (HAL-10849). The engine
// refuses it with the next step (rules N1, N2 and N3 of the UX check, HAL-12363).

import { startsAProgram, type WorkflowRef } from "@halonicjs/adapter-workspace-models";
import type { Agent } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import { StartInTerminal } from "@halonicjs/studio-feature-workflows/api";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { harnessName } from "../studio/harness-name.ts";

/** Why the page can't start an agent (rule N1 of the UX check, HAL-12363). */
export interface PageRefusal {
  readonly reason: string;
  /**
   * The step inside Studio that lets the page start it, for an agent in a harness program. A step
   * in Studio wins over a terminal command (rule N3), and the command line refuses that agent too.
   */
  readonly studioStep?: string;
}

/**
 * Why the page can't start an agent in a harness program, when it runs no agent host, or one
 * that lists a connector; `undefined` when it can.
 */
export function whyThePageCantStart(agent: Agent, runsHarnesses: boolean): PageRefusal | undefined {
  if (agent.harness !== undefined && startsAProgram(agent.harness) && !runsHarnesses) {
    const program = harnessName(agent.harness);
    return {
      reason: `${agent.name} runs in ${program}, which Halonic can't start yet.`,
      studioStep: `Set ${agent.name} to Halonic on its Harness page to run it now.`,
    };
  }
  if (agent.connectors.length > 0) {
    return {
      reason: `${agent.name} uses a connector, which Studio can't start yet.`,
    };
  }
  return undefined;
}

/**
 * The refusal with its next step: the step inside Studio when there is one (HAL-12642), otherwise
 * the command that starts the run in a terminal (rule N2).
 */
export function startRefusal({ reason, studioStep }: PageRefusal, runCommand: string): KindedError {
  if (studioStep !== undefined) return new KindedError("unavailable", reason, { fix: studioStep });
  return new StartInTerminal({
    reason,
    lead: "To start it, run this in a terminal:",
    command: runCommand,
  });
}

/** `halonic run reply`, or `halonic run acme/reply` when another hub has a `reply` too, as the workflow page writes it. */
export function runCommandOf(
  workspace: LoadedWorkspace,
  { hubId, workflowId }: WorkflowRef,
): string {
  const inSeveralHubs = filesOf(workspace, "workflow").some(
    (file) => file.value.id === workflowId && file.hub !== null && file.hub !== hubId,
  );
  return inSeveralHubs ? `halonic run ${hubId}/${workflowId}` : `halonic run ${workflowId}`;
}
