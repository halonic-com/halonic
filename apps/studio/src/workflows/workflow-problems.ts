import type { WorkflowProblem } from "@halonicjs/studio-feature-workflows/api";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  type WorkspaceIssue,
} from "@halonicjs/workspace";
import { problemsOf } from "./workflow-files.ts";

type Agent = LoadedFileOf<"agent">;

/**
 * The problems of one workflow as its page shows them (`studio.workflow-problem-agent`): its own
 * file's, with the step each is about, and the errors of the agents its steps name, with the agent
 * and, for a model alias the workspace doesn't have, that alias (UX check S7, HAL-12412).
 */
export function workflowProblemsOf(
  workspace: LoadedWorkspace,
  file: LoadedFileOf<"workflow">,
): WorkflowProblem[] {
  const agents = filesOf(workspace, "agent").filter((one) => one.hub === file.hub);
  return problemsOf(workspace, file).map((issue) => {
    const agent = agents.find((one) => one.path === issue.file);
    return {
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      stepId: issue.path[0] === "states" ? String(issue.path[1]) : undefined,
      ...(agent && agentFacts(agent, issue)),
    };
  });
}

/** The agent an issue is in, and the alias it names when the issue is that the alias is missing. */
function agentFacts(agent: Agent, issue: WorkspaceIssue): Partial<WorkflowProblem> {
  const named = { agent: { id: agent.value.id, name: agent.value.name } };
  if (issue.code !== "unknown-model-alias") return named;
  return { ...named, modelAlias: modelAt(agent, issue.path) };
}

/**
 * The model the issue's path points at: the agent's own `model`, or a method's
 * (`methods.<id>.model`), as the check names them.
 */
function modelAt(agent: Agent, path: WorkspaceIssue["path"]): string | undefined {
  if (path[0] === "methods") return agent.value.methods[String(path[1])]?.model;
  return agent.value.model;
}
