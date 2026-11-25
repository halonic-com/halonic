import type { Tool, WriteModeName } from "@halonicjs/format";
import type { ActionCall, ActionHandler } from "./handlers.ts";
import type {
  Capability,
  DispositionPatch,
  DispositionResult,
  IssueActor,
  IssuePatch,
  IssueRecord,
  ToolResult,
} from "./host.ts";
import { monitorPolicy, readFinishRunParams, readSetNextStepParams } from "./next-step-input.ts";
import type { PaperclipAccess } from "./paperclip-access.ts";
import { readCommentParams, ToolInputError } from "./task-input.ts";

/**
 * The writing actions `paperclip.comment`, `paperclip.next-step` and
 * `paperclip.finish-run` (HAL-17956), ported from the task tools in
 * `tooling/paperclip`. Each first checks everything and plans its writes;
 * only then does the tool file's `mode` decide whether they are made
 * (`write`) or only shown (`dry-run`, also for a missing or unknown mode).
 * The agent's parameters never pick the mode.
 *
 * A task change goes through `issues.setDisposition` when the host has it
 * (Halonic's server: Paperclip's own route and guard, as the calling run).
 * Another Paperclip gets the plain update with the comment posted first, so
 * a handoff, which stops the calling run, still leaves its comment. The
 * states the disposition guard refuses that can be told here are refused
 * on both paths, before anything is planned.
 */

/** One write an action makes, in the order it makes them. */
export type PlannedWrite =
  | {
      readonly kind: "comment";
      readonly issueId: string;
      readonly body: string;
      readonly authorAgentId: string;
    }
  | {
      readonly kind: "update";
      readonly issueId: string;
      readonly patch: IssuePatch;
      readonly actor: IssueActor;
    }
  | { readonly kind: "disposition"; readonly issueId: string; readonly patch: DispositionPatch };

/** What a call will do once its checks pass: the task and the writes. */
interface WritePlan {
  readonly task: string;
  readonly writes: readonly PlannedWrite[];
}

/** The mode the tool file sets; anything other than `write` is a dry run. */
export function writeMode(tool: Tool): WriteModeName {
  const settings = (tool.action as { readonly with?: { readonly mode?: unknown } }).with;
  return settings?.mode === "write" ? "write" : "dry-run";
}

function identifierOf(issue: IssueRecord): string {
  return issue.identifier ?? issue.id;
}

/** The task by identifier or id in the caller's company. */
async function findTask(paperclip: PaperclipAccess, task: string): Promise<IssueRecord> {
  const issue = await paperclip.issues.get(task, paperclip.companyId);
  if (issue === null) {
    throw new ToolInputError(`no task ${task} in this company, or the plugin may not read it.`);
  }
  return issue;
}

/** A task change is only for the task the caller holds, as the disposition guard requires. */
function refuseUnlessHeld(issue: IssueRecord, call: ActionCall): void {
  if (issue.assigneeAgentId !== call.caller.agentId) {
    throw new ToolInputError(
      `${identifierOf(issue)} isn't yours: this tool only changes a task you hold.`,
    );
  }
}

async function blockerIds(paperclip: PaperclipAccess, blockedBy: readonly string[]) {
  const found = await Promise.all(blockedBy.map((one) => findTask(paperclip, one)));
  return found.map((issue) => issue.id);
}

/** The agent named `to`, by name or url key, ignoring case. */
async function agentNamed(paperclip: PaperclipAccess, to: string) {
  const wanted = to.toLowerCase();
  const agents = await paperclip.agents.list({ companyId: paperclip.companyId, limit: 500 });
  const agent = agents.find(
    (one) => one.name.toLowerCase() === wanted || one.urlKey.toLowerCase() === wanted,
  );
  if (agent === undefined) {
    throw new ToolInputError(`no agent named ${to} in this company.`);
  }
  return agent;
}

/** Clears the task's monitor when it has one, so a task that leaves the agent wakes nobody later. */
function clearedMonitor(issue: IssueRecord): Pick<DispositionPatch, "monitor"> {
  return issue.monitorNextCheckAt == null ? {} : { monitor: null };
}

/** The writes for one task change: one disposition, or the comment then the plain update. */
function changeWrites(call: ActionCall, issue: IssueRecord, change: DispositionPatch): WritePlan {
  const task = identifierOf(issue);
  if (call.paperclip.issues.setDisposition !== undefined) {
    return { task, writes: [{ kind: "disposition", issueId: issue.id, patch: change }] };
  }
  const { comment, monitor: _monitor, ...patch } = change;
  const actor = { actorAgentId: call.caller.agentId, actorRunId: call.paperclip.runId };
  return {
    task,
    writes: [
      { kind: "comment", issueId: issue.id, body: comment, authorAgentId: call.caller.agentId },
      { kind: "update", issueId: issue.id, patch, actor },
    ],
  };
}

/** `in_progress` needs a monitor, and only `setDisposition` can set one. */
function refuseWithoutMonitorRoute(call: ActionCall): void {
  if (call.paperclip.issues.setDisposition === undefined) {
    throw new ToolInputError(
      "in_progress needs a monitor, and this Paperclip doesn't let a plugin set one: set the task's monitor yourself.",
    );
  }
}

async function planComment(call: ActionCall): Promise<WritePlan> {
  const { task, body } = readCommentParams(call.params);
  const issue = await findTask(call.paperclip, task);
  const authorAgentId = call.caller.agentId;
  return {
    task: identifierOf(issue),
    writes: [{ kind: "comment", issueId: issue.id, body, authorAgentId }],
  };
}

async function planNextStep(call: ActionCall): Promise<WritePlan> {
  const { task, step, comment } = readSetNextStepParams(call.params);
  const issue = await findTask(call.paperclip, task);
  refuseUnlessHeld(issue, call);
  if (step.status === "in_progress") {
    refuseWithoutMonitorRoute(call);
    const checksUsed = issue.executionState?.monitor?.attemptCount ?? 0;
    const monitor = monitorPolicy(step.monitor, call.now, checksUsed);
    return changeWrites(call, issue, { status: "in_progress", monitor, comment });
  }
  const blockedByIssueIds = await blockerIds(call.paperclip, step.blockedBy);
  return changeWrites(call, issue, {
    status: "blocked",
    blockedByIssueIds,
    comment,
    ...clearedMonitor(issue),
  });
}

async function planFinishRun(call: ActionCall): Promise<WritePlan> {
  const { task, outcome, comment } = readFinishRunParams(call.params);
  const issue = await findTask(call.paperclip, task);
  refuseUnlessHeld(issue, call);
  if (outcome.outcome === "done") {
    return changeWrites(call, issue, { status: "done", comment });
  }
  if (outcome.outcome === "blocked") {
    const blockedByIssueIds = await blockerIds(call.paperclip, outcome.blockedBy);
    return changeWrites(call, issue, {
      status: "blocked",
      blockedByIssueIds,
      comment,
      ...clearedMonitor(issue),
    });
  }
  const agent = await agentNamed(call.paperclip, outcome.to);
  if (agent.id === call.caller.agentId) {
    throw new ToolInputError(
      "the task is already yours: to keep working, call set_next_step instead.",
    );
  }
  return changeWrites(call, issue, {
    status: "todo",
    assigneeAgentId: agent.id,
    comment,
    ...clearedMonitor(issue),
  });
}

/** One planned write in words, for the dry-run answer. */
function described(write: PlannedWrite, task: string): string {
  if (write.kind === "comment") {
    return `post your comment on ${task}`;
  }
  const { status, assigneeAgentId, blockedByIssueIds } = write.patch;
  const parts = [`set ${task} to ${status}`];
  if (assigneeAgentId !== undefined) parts.push(`assigned to agent ${assigneeAgentId}`);
  if (blockedByIssueIds !== undefined) parts.push(`blocked by ${blockedByIssueIds.join(", ")}`);
  if (write.kind === "disposition") parts.push("with your comment");
  return parts.join(", ");
}

/** The route's refusal as the agent reads it: its status, message and code. */
function refusal(result: DispositionResult): string {
  const body = (result.body ?? {}) as { error?: unknown; code?: unknown };
  const message = typeof body.error === "string" ? body.error : JSON.stringify(result.body);
  const code = typeof body.code === "string" ? ` (${body.code})` : "";
  return `Paperclip refused (${result.status})${code}: ${message}`;
}

/** Makes one write; answers what it made, or throws Paperclip's refusal. */
async function made(paperclip: PaperclipAccess, write: PlannedWrite): Promise<string> {
  const { issues, companyId } = paperclip;
  if (write.kind === "comment") {
    const posted = await issues.createComment(write.issueId, write.body, companyId, {
      authorAgentId: write.authorAgentId,
    });
    return `posted comment ${posted.id}`;
  }
  if (write.kind === "update") {
    const task = await issues.update(write.issueId, write.patch, companyId, write.actor);
    return `set it to ${task.status}`;
  }
  const result = await issues.setDisposition?.(write.issueId, companyId, write.patch);
  if (result === undefined || !result.ok) {
    throw new ToolInputError(
      result === undefined ? "Paperclip lost setDisposition." : refusal(result),
    );
  }
  const task = (result.body ?? {}) as Partial<IssueRecord>;
  const monitor = task.monitorNextCheckAt == null ? "none" : String(task.monitorNextCheckAt);
  return `set it to ${task.status ?? write.patch.status} with your comment; next monitor check: ${monitor}`;
}

/** Shows the plan in dry run, or makes its writes in order. */
async function carriedOut(call: ActionCall, plan: WritePlan): Promise<ToolResult> {
  const { task, writes } = plan;
  if (writeMode(call.tool) !== "write") {
    const would = writes.map((write) => described(write, task)).join(", then ");
    return {
      content: `Dry run: would ${would}. Nothing was written; the tool file sets mode: write when it goes live.`,
      data: { mode: "dry-run", task, writes },
    };
  }
  const done: string[] = [];
  for (const write of writes) {
    try {
      done.push(await made(call.paperclip, write));
    } catch (error) {
      const before = done.length === 0 ? "" : ` (already ${done.join(", ")})`;
      throw new ToolInputError(`${(error as Error).message}${before}`);
    }
  }
  return {
    content: `On ${task}: ${done.join(", then ")}. A comment wakes nobody: to hand the task on, use finish_run.`,
    data: { mode: "write", task, done },
  };
}

/** A writing action from its planner and the capabilities its writes need. */
function writingAction(
  capabilities: readonly Capability[],
  plan: (call: ActionCall) => Promise<WritePlan>,
): ActionHandler {
  return { capabilities, run: async (call) => carriedOut(call, await plan(call)) };
}

const taskChange: readonly Capability[] = ["issues.read", "issue.comments.create", "issues.update"];

/** The writing actions' handlers, by action name. Only finish_run finds an agent by name. */
export const writeActionHandlers = {
  "paperclip.comment": writingAction(["issues.read", "issue.comments.create"], planComment),
  "paperclip.next-step": writingAction(taskChange, planNextStep),
  "paperclip.finish-run": writingAction([...taskChange, "agents.read"], planFinishRun),
} as const;
