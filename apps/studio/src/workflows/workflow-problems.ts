import { workspaceProblemsOf } from "@halonicjs/adapter-workspace-models";
import type { WorkflowProblem } from "@halonicjs/studio-feature-workflows/api";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  type WorkspaceIssue,
} from "@halonicjs/workspace";
import { problemsOf } from "./workflow-files.ts";
import { arrowIndexOf } from "./workflow-view.ts";

type Agent = LoadedFileOf<"agent">;

/**
 * The problems of one workflow as its page shows them (`studio.workflow-problem-agent`): its own
 * file's, with the step and the arrow each is about, and the errors elsewhere that stop its run,
 * with the file they are in (HAL-15343) and, for an agent its steps name, the agent and, for a
 * model alias the workspace doesn't have, that alias (UX check S7, HAL-12412) and, when an agent
 * step names it, that agent step (C605).
 */
export function workflowProblemsOf(
  workspace: LoadedWorkspace,
  file: LoadedFileOf<"workflow">,
): WorkflowProblem[] {
  const agents = filesOf(workspace, "agent").filter((one) => one.hub === file.hub);
  return problemsOf(workspace, workspaceProblemsOf(workspace), file).map((issue) => {
    const agent = agents.find((one) => one.path === issue.file);
    const ownFile = issue.file === file.path;
    return {
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      // A called workflow's file has steps and arrows too, but they aren't this workflow's.
      stepId: ownFile && issue.path[0] === "states" ? String(issue.path[1]) : undefined,
      arrowIndex: ownFile ? arrowIndexOf(issue.path) : undefined,
      ...(issue.file !== "" && !ownFile && { file: issue.file }),
      ...(agent && agentFacts(agent, issue)),
    };
  });
}

/**
 * The agent an issue is in, and the alias it names when the issue is that the alias is missing:
 * the agent's own `model`, or an agent step's (`methods.<id>.model`) together with the agent
 * step, whose model can't be changed on the agent's page (Sofia, #4515; C605).
 */
function agentFacts(agent: Agent, issue: WorkspaceIssue): Partial<WorkflowProblem> {
  const named = { agent: { id: agent.value.id, name: agent.value.name } };
  if (issue.code !== "unknown-model-alias") return named;
  const [key, agentStep] = issue.path;
  if (key === "methods" && agentStep !== undefined) {
    const model = agent.value.methods[String(agentStep)]?.model;
    return { ...named, modelAlias: model, agentStep: String(agentStep) };
  }
  return { ...named, modelAlias: agent.value.model };
}
