import type { PluginAgentsClient, PluginIssuesClient } from "@paperclipai/plugin-sdk";
import type { AgentRow, CommentRow, Paperclip, TaskRow } from "../pr-watcher/paperclip.ts";

/**
 * The PR watcher's Paperclip, on top of the plugin host's API. This is the
 * only file that changes a task's status, and `doneOnly` lets it set `done`
 * and nothing else: the manifest can't narrow `issues.update`.
 */

/** The part of the plugin context the adapter uses, so tests can fake it. */
export interface HostApi {
  readonly issues: Pick<
    PluginIssuesClient,
    "list" | "listComments" | "createComment" | "update" | "requestWakeup"
  >;
  readonly agents: Pick<PluginAgentsClient, "list">;
}

/** Statuses of a task whose work isn't finished. A blocked task waits on someone else. */
const openStatuses = ["backlog", "todo", "in_progress", "in_review", "blocked"] as const;
const watchedStatuses: ReadonlySet<string> = new Set(["todo", "in_progress", "in_review"]);
const pageSize = 500;

/** The only status change the watcher may make. Anything else throws before it reaches the host. */
export function doneOnly(patch: Readonly<Record<string, unknown>>): { status: "done" } {
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== "status" || patch["status"] !== "done") {
    throw new Error(`PR watcher: refusing a task change other than done (${keys.join(", ")}).`);
  }
  return { status: "done" };
}

/** A host time (a `Date`, or a string over the wire) as ISO, or null when there is none. */
function isoOrNull(value: Date | string | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString();
}

type ListedIssue = Awaited<ReturnType<HostApi["issues"]["list"]>>[number];

async function everyIssue(host: HostApi, companyId: string): Promise<ListedIssue[]> {
  const issues: ListedIssue[] = [];
  for (const status of openStatuses) {
    for (let offset = 0; ; offset += pageSize) {
      const page = await host.issues.list({ companyId, status, limit: pageSize, offset });
      issues.push(...page);
      if (page.length < pageSize) {
        break;
      }
    }
  }
  return issues;
}

/** A Paperclip for one company, limited to what the watcher needs. */
export function paperclipHost(host: HostApi, companyId: string): Paperclip {
  return {
    async openTasks() {
      const issues = await everyIssue(host, companyId);
      const parents = new Set(issues.flatMap((issue) => issue.parentId ?? []));
      return issues
        .filter((issue) => watchedStatuses.has(issue.status) && issue.identifier !== null)
        .map(
          (issue): TaskRow => ({
            id: issue.id,
            identifier: issue.identifier ?? "",
            assigneeAgentId: issue.assigneeAgentId,
            running: issue.activeRun != null,
            openChildren: parents.has(issue.id),
            monitorNextCheckAt: isoOrNull(issue.monitorNextCheckAt),
            monitorLastTriggeredAt: isoOrNull(issue.monitorLastTriggeredAt),
          }),
        );
    },
    async comments(taskId) {
      const comments = await host.issues.listComments(taskId, companyId);
      return comments.map(
        (comment): CommentRow => ({
          authorAgentId: comment.authorAgentId,
          authorUserId: comment.authorUserId,
          createdAt: new Date(comment.createdAt).toISOString(),
          body: comment.body,
        }),
      );
    },
    async agents() {
      const agents = await host.agents.list({ companyId, limit: pageSize });
      return agents.map((agent): AgentRow => ({ id: agent.id, urlKey: agent.urlKey }));
    },
    async wake(taskId, body, key) {
      await host.issues.createComment(taskId, body, companyId);
      // A plugin's comment wakes nobody, so the wake-up is its own call.
      await host.issues.requestWakeup(taskId, companyId, {
        reason: "pr_watcher",
        idempotencyKey: `pr-watcher ${taskId} ${key}`,
      });
    },
    async markDone(taskId, body) {
      await host.issues.update(taskId, doneOnly({ status: "done" }), companyId);
      await host.issues.createComment(taskId, body, companyId);
    },
  };
}
