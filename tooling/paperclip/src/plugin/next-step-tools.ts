import type {
  Issue,
  PluginAgentsClient,
  PluginIssuesClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { ToolInputError } from "../task-tools/input.ts";
import {
  monitorPolicy,
  readFinishRunParams,
  readSetNextStepParams,
} from "../task-tools/next-step.ts";
import type { MetricsApi } from "./metrics.ts";
import { findTask, registerCounted, type TaskToolsApi } from "./task-tools.ts";

/**
 * The task tools `set_next_step` and `finish_run` (HAL-16403, B2 in the tools
 * plan on HAL-15920). Both change a task through the host method
 * `issues.setDisposition` (halonic-com/server#31), which sends the change
 * through Paperclip's own `PATCH /api/issues/:id` as the calling agent's run:
 * the same disposition guard, wakes, monitor rules and answers as the agent's
 * own request (HAL-16988, decision B). The rules in next-step.ts only refuse
 * states that are sure to be wrong before anything is sent.
 */

/** The change `issues.setDisposition` takes; the SDK's index doesn't export the type. */
type DispositionPatch = Parameters<PluginIssuesClient["setDisposition"]>[2];
/** The route's answer as the host passes it on. */
type DispositionResult = Awaited<ReturnType<PluginIssuesClient["setDisposition"]>>;

/** The part of the plugin context these tools use, so tests can fake it. */
export interface NextStepToolsApi extends MetricsApi {
  readonly tools: TaskToolsApi["tools"];
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly issues: Pick<PluginIssuesClient, "get" | "setDisposition">;
}

/** The task's id for each blocker identifier, so the route gets ids it can store. */
async function blockerIds(
  ctx: NextStepToolsApi,
  blockedBy: readonly string[],
  companyId: string,
): Promise<string[]> {
  const found = await Promise.all(blockedBy.map((one) => findTask(ctx, one, companyId)));
  return found.map((issue) => issue.id);
}

/** The agent named `to`, by name or url key, ignoring case. */
async function agentNamed(ctx: NextStepToolsApi, to: string, companyId: string) {
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  const wanted = to.toLowerCase();
  const agent = agents.find(
    (one) => one.name.toLowerCase() === wanted || one.urlKey.toLowerCase() === wanted,
  );
  if (agent === undefined) {
    throw new ToolInputError(`no agent named ${to} in this company.`);
  }
  return agent;
}

/** Clears the task's monitor when it has one, so a task that leaves the agent wakes nobody later. */
function clearedMonitor(issue: Issue): Partial<Pick<DispositionPatch, "monitor">> {
  return issue.monitorNextCheckAt == null ? {} : { monitor: null };
}

/** The route's refusal as the agent reads it: its status, message and code. */
function refusal(result: DispositionResult): string {
  const body = (result.body ?? {}) as { error?: unknown; code?: unknown };
  const message = typeof body.error === "string" ? body.error : JSON.stringify(result.body);
  const code = typeof body.code === "string" ? ` (${body.code})` : "";
  return `Paperclip refused (${result.status})${code}: ${message}`;
}

/** Sends the change and answers with the task's new state, or with the route's refusal. */
async function send(
  ctx: NextStepToolsApi,
  issue: Issue,
  companyId: string,
  patch: DispositionPatch,
): Promise<ToolResult> {
  const result = await ctx.issues.setDisposition(issue.id, companyId, patch);
  if (!result.ok) {
    throw new ToolInputError(refusal(result));
  }
  const task = (result.body ?? {}) as Partial<Issue>;
  const identifier = issue.identifier ?? issue.id;
  const monitor = task.monitorNextCheckAt == null ? "none" : String(task.monitorNextCheckAt);
  return {
    content: `${identifier} is now ${task.status ?? patch.status}; next monitor check: ${monitor}. Your comment is posted.`,
    data: { task: identifier, status: task.status ?? null, monitorNextCheckAt: monitor },
  };
}

/** `set_next_step` and `finish_run` on `now`'s clock, ready to register. */
export function nextStepHandlers(now: () => Date) {
  async function setNextStep(ctx: NextStepToolsApi, params: unknown, runCtx: ToolRunContext) {
    const { task, step, comment } = readSetNextStepParams(params);
    const issue = await findTask(ctx, task, runCtx.companyId);
    if (step.status === "in_progress") {
      const monitor = monitorPolicy(step.monitor, now());
      return send(ctx, issue, runCtx.companyId, { status: "in_progress", monitor, comment });
    }
    const blockedByIssueIds = await blockerIds(ctx, step.blockedBy, runCtx.companyId);
    return send(ctx, issue, runCtx.companyId, {
      status: "blocked",
      blockedByIssueIds,
      comment,
      ...clearedMonitor(issue),
    });
  }

  async function finishRun(ctx: NextStepToolsApi, params: unknown, runCtx: ToolRunContext) {
    const { task, outcome, comment } = readFinishRunParams(params);
    const issue = await findTask(ctx, task, runCtx.companyId);
    const companyId = runCtx.companyId;
    if (outcome.outcome === "done") {
      return send(ctx, issue, companyId, { status: "done", comment });
    }
    if (outcome.outcome === "blocked") {
      const blockedByIssueIds = await blockerIds(ctx, outcome.blockedBy, companyId);
      return send(ctx, issue, companyId, {
        status: "blocked",
        blockedByIssueIds,
        comment,
        ...clearedMonitor(issue),
      });
    }
    const agent = await agentNamed(ctx, outcome.to, companyId);
    if (agent.id === runCtx.agentId) {
      throw new ToolInputError(
        "the task is already yours: to keep working, call set_next_step instead.",
      );
    }
    // Paperclip stops this run as the task changes hands, so this answer may never arrive.
    return send(ctx, issue, companyId, {
      status: "todo",
      assigneeAgentId: agent.id,
      comment,
      ...clearedMonitor(issue),
    });
  }

  return { set_next_step: setNextStep, finish_run: finishRun };
}

/** Registers `set_next_step` and `finish_run` as the manifest declares them, each call counted. */
export function registerNextStepTools(ctx: NextStepToolsApi, now = () => new Date()): void {
  registerCounted(ctx, nextStepHandlers(now));
}
