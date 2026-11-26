import { hubWorkflows, testModelsOf, workflowIn } from "@halonicjs/app";
import type { WaitFacts, WorkspaceInfo } from "@halonicjs/host-server";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { workspaceAgentNames } from "./agent-names.ts";

/**
 * The served workspace's workflows and test models, for the context of the
 * server's waiting list (requirement `cli.commands.serve.wait-facts`): each
 * workflow's name, start field and step descriptions, and which providers are
 * the test model, decided as the CLI's "Sample answers" line decides it.
 *
 * @param workspace reads the live version on each call, as the agents' names do
 */
export function workspaceWaitFacts(
  workspace: () => Promise<LoadedWorkspace>,
): () => Promise<WaitFacts> {
  return async () => {
    const loaded = await workspace();
    const workflows = hubWorkflows(loaded);
    const testModels = testModelsOf(loaded);
    return {
      workflow: (hubId, workflowId) => {
        const found = workflowIn(workflows, hubId, workflowId);
        if (found === undefined) return undefined;
        return {
          name: found.name,
          ...(found.start === undefined ? {} : { startField: found.start.field }),
          // `Object.hasOwn`, so a state id such as `constructor` is never read off the prototype.
          stepDescription: (stateId) =>
            Object.hasOwn(found.states, stateId) ? found.states[stateId]?.description : undefined,
        };
      },
      isTestModel: (providerId) => testModels.has(providerId),
    };
  };
}

/**
 * What the server's waiting list reads from the served workspace: the agents' names and the
 * workflows and test models, both from the live version at every request.
 */
export function waitingListFacts(
  workspace: () => Promise<LoadedWorkspace>,
): Required<Pick<WorkspaceInfo, "agentNames" | "waitFacts">> {
  return {
    agentNames: workspaceAgentNames(workspace),
    waitFacts: workspaceWaitFacts(workspace),
  };
}
