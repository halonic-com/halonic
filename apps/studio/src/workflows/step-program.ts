import { startsAProgram } from "@halonicjs/adapter-workspace-models";
import type { WorkflowStepProgram } from "@halonicjs/studio-feature-workflows/api";
import type { LoadedFileOf } from "@halonicjs/workspace";

/** The first of a step's agents that runs in a program needing the sandbox, as the step names it. */
export function programOf(
  agents: readonly LoadedFileOf<"agent">[] | undefined,
): WorkflowStepProgram | undefined {
  const agent = agents?.find(({ value }) => startsAProgram(value.harness));
  const harness = agent?.value.harness;
  if (agent === undefined || harness === undefined || harness === "halonic") return undefined;
  return { agent: agent.value.id, agentName: agent.value.name, harness };
}
