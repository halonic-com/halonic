import type { PluginAgentsClient, PluginIssuesClient } from "@paperclipai/plugin-sdk";
import type {
  AgentRow,
  CommentRow,
  Paperclip,
  TaskRow,
  WriteOutcome,
} from "../pr-watcher/paperclip.ts";

/**
 * The PR watcher's Paperclip, on top of the plugin host's API. This is the
 * only file that changes a task's status, and `doneOnly` lets it set `done`
 * and nothing else: the manifest can't narrow `issues.update`.
 */

/** The part of the plugin context the adapter uses, so tests can fake it. */
export interface HostApi {
  readonly issues: Pick<
    PluginIssuesClient,
    "list" | "get" | "listComments" | "createComment" | "update" | "requestWakeup"
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

/** Every task whose work isn't finished, page by page. */
export async function everyIssue(
  host: { readonly issues: Pick<HostApi["issues"], "list"> },
  companyId: string,
): Promise<ListedIssue[]> {
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
      if (!(await stillWatched(host, taskId, companyId))) {
        return "closed";
      }
      await host.issues.createComment(taskId, body, companyId);
      // A plugin's comment wakes nobody, so the wake-up is its own call.
      return wakeAssignee(host, taskId, companyId, key);
    },
    async markDone(taskId, body) {
      if (!(await stillWatched(host, taskId, companyId))) {
        return "closed";
      }
      await host.issues.update(taskId, doneOnly({ status: "done" }), companyId);
      await host.issues.createComment(taskId, body, companyId);
      return "written";
    },
  };
}

/** The host's refusal to wake a task that is done or cancelled. */
const notWakeablePattern = /not wakeable in status/i;

async function wakeAssignee(
  host: HostApi,
  taskId: string,
  companyId: string,
  key: string,
): Promise<WriteOutcome> {
  try {
    await host.issues.requestWakeup(taskId, companyId, {
      reason: "pr_watcher",
      idempotencyKey: `pr-watcher ${taskId} ${key}`,
    });
    return "written";
  } catch (error) {
    // Closed between the re-read and the wake-up: nobody is left to wake.
    if (notWakeablePattern.test((error as Error).message)) {
      return "closed";
    }
    throw error;
  }
}

/**
 * Re-reads a task right before a write. A pass over every task takes about a
 * minute, and an author who closes their task in that time shouldn't get a
 * comment on a done task or fail the pass (HAL-16139, 22 Nov).
 */
async function stillWatched(host: HostApi, taskId: string, companyId: string): Promise<boolean> {
  const issue = await host.issues.get(taskId, companyId);
  return issue !== null && watchedStatuses.has(issue.status);
}
