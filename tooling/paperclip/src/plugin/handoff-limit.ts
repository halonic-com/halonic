import type { PluginEvent, PluginIssuesClient, PluginLogger } from "@paperclipai/plugin-sdk";
import {
  decideHandoff,
  type HandoffRecord,
  isChannelParent,
  stoppedComment,
} from "../handoff-limit/decide.ts";
import type { StateApi } from "../snapshot/store.ts";
import { errorCode } from "./board-check-api.ts";
import { assignTaskBack } from "./host.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The hand-off limit (K3, HAL-17628): on a channel child task's
 * `issue.created` and `issue.updated` it counts the agents' reassignments and
 * assigns the task back after the third. Paperclip has no hook that refuses
 * an assignment, so the limit is kept by undoing the fourth. Its log and
 * metrics name task identifiers only, never task text.
 */

/** The part of the plugin context the handler uses, so tests can fake it. */
export interface HandoffLimitApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "update" | "createComment">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

type Issue = NonNullable<Awaited<ReturnType<HandoffLimitApi["issues"]["get"]>>>;

function recordKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "handoffs",
    stateKey: "record",
  } as const;
}

/**
 * The assignee as the event saw it: from the payload when it carries one, so
 * two quick reassignments are each counted, and otherwise from the task now.
 */
function assigneeAtEvent(event: PluginEvent, issue: Issue): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (!("assigneeAgentId" in payload)) {
    return issue.assigneeAgentId;
  }
  const assignee = payload["assigneeAgentId"];
  return typeof assignee === "string" ? assignee : null;
}

/**
 * Whether a person made the task, not an agent. The Paperclip provider makes a
 * channel's parent with the board's key, so an agent can't make a channel by
 * tagging a task it created (HAL-18122, the marker `readChannel` uses).
 */
function madeByPerson(task: Issue): boolean {
  const byUser = typeof task.createdByUserId === "string" && task.createdByUserId !== "";
  const byAgent = typeof task.createdByAgentId === "string" && task.createdByAgentId !== "";
  return byUser && !byAgent;
}

/** Whether the task's parent is a channel's parent task. */
async function underChannel(ctx: HandoffLimitApi, issue: Issue): Promise<boolean> {
  if (issue.parentId === null || issue.parentId === undefined) {
    return false;
  }
  const parent = await ctx.issues.get(issue.parentId, issue.companyId);
  if (parent === null || !madeByPerson(parent)) {
    return false;
  }
  return isChannelParent((parent.labels ?? []).map((label) => label.name));
}

/**
 * Assigns the task back, unless someone changed its assignee since the event:
 * that change has its own event. Returns whether it went through.
 */
async function assignBack(
  ctx: HandoffLimitApi,
  issue: Issue,
  seen: string | null,
  agentId: string,
): Promise<boolean> {
  const fresh = await ctx.issues.get(issue.id, issue.companyId);
  if (fresh === null || fresh.assigneeAgentId !== seen) {
    return false;
  }
  await assignTaskBack(ctx.issues, issue.id, agentId, issue.companyId);
  await ctx.issues.createComment(issue.id, stoppedComment, issue.companyId);
  return true;
}

/** Handles one event for one task, start to finish. */
async function handle(ctx: HandoffLimitApi, event: PluginEvent, taskId: string): Promise<void> {
  const issue = await ctx.issues.get(taskId, event.companyId);
  if (issue === null || !(await underChannel(ctx, issue))) {
    return;
  }
  const stored = (await ctx.state.get(recordKey(taskId))) as HandoffRecord | null;
  const seen = assigneeAtEvent(event, issue);
  const decision = decideHandoff(stored ?? undefined, seen, event.actorType ?? "unknown");
  if (decision.revertTo !== undefined) {
    const meta = { companyId: issue.companyId };
    const name = issue.identifier ?? issue.id;
    if (await assignBack(ctx, issue, seen, decision.revertTo)) {
      ctx.logger.info(`Hand-off limit: assigned ${name} back after 3 hand-offs.`, meta);
      await writeMetrics(ctx, { "handoff_limit.reverted": 1 }, meta);
    } else {
      ctx.logger.info(`Hand-off limit: left ${name} alone, its assignee changed meanwhile.`, meta);
    }
  }
  await ctx.state.set(recordKey(taskId), decision.record);
}

/** The hand-off limit for one plugin worker. */
export interface HandoffLimit {
  /** A task was created or changed: count an agent's hand-off and undo one past the limit. */
  onIssueEvent(event: PluginEvent): Promise<void>;
}

/**
 * The handler. Events for one task run one after another, so the
 * `issue.updated` its own assign-back causes is read after its record is saved.
 */
export function handoffLimit(ctx: HandoffLimitApi): HandoffLimit {
  const running = new Map<string, Promise<void>>();
  return {
    async onIssueEvent(event) {
      const payload = (event.payload ?? {}) as { id?: unknown };
      const taskId = event.entityId ?? (typeof payload.id === "string" ? payload.id : undefined);
      if (taskId === undefined) {
        return;
      }
      const work = async () => {
        try {
          await handle(ctx, event, taskId);
        } catch (error) {
          ctx.logger.error(`Hand-off limit: couldn't handle a task event (${errorCode(error)}).`, {
            companyId: event.companyId,
          });
        }
      };
      const next = (running.get(taskId) ?? Promise.resolve()).then(work);
      running.set(taskId, next);
      await next;
      if (running.get(taskId) === next) {
        running.delete(taskId);
      }
    },
  };
}
