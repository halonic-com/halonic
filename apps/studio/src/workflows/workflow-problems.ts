import { workspaceProblemsOf } from "@halonicjs/adapter-workspace-models";
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
 * and, for the agent's own model alias the workspace doesn't have, that alias (UX check S7,
 * HAL-12412).
 */
export function workflowProblemsOf(
  workspace: LoadedWorkspace,
  file: LoadedFileOf<"workflow">,
): WorkflowProblem[] {
  const agents = filesOf(workspace, "agent").filter((one) => one.hub === file.hub);
  return problemsOf(workspace, workspaceProblemsOf(workspace), file).map((issue) => {
    const agent = agents.find((one) => one.path === issue.file);
    return {
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      // A called workflow's file has steps too, but they aren't this workflow's.
      stepId:
        issue.file === file.path && issue.path[0] === "states" ? String(issue.path[1]) : undefined,
      ...(agent && agentFacts(agent, issue)),
    };
  });
}

/**
 * The agent an issue is in, and the alias it names when the issue is that the agent's own model
 * alias is missing. A method's (agent step's) alias gets none: its model can't be changed on the
 * agent's page, so the page's line would point to a fix that isn't there (Sofia, #4515).
 */
function agentFacts(agent: Agent, issue: WorkspaceIssue): Partial<WorkflowProblem> {
  const named = { agent: { id: agent.value.id, name: agent.value.name } };
  if (issue.code !== "unknown-model-alias" || issue.path[0] !== "model") return named;
  return { ...named, modelAlias: agent.value.model };
}
