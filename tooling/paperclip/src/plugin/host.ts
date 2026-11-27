import type {
  PluginAgentsClient,
  PluginIssuesClient,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import type {
  AgentRow,
  CommentRow,
  Paperclip,
  TaskRow,
  WriteOutcome,
} from "../pr-watcher/paperclip.ts";
import { waitingRunStatuses } from "../pr-watcher/paperclip.ts";
import { automaticNoteIds, isAutomaticNote } from "./front-bot-notes.ts";

/**
 * The PR watcher's Paperclip, on top of the plugin host's API. This is the
 * only file that changes a task through the SDK: `doneOnly` lets the watcher
 * set `done`, `handoffOnly` lets it give a task to one agent with status
 * `todo` (its reviewer, HAL-17675), `todoOnly` lets its unblock sweep set `todo`
 * on a blocked task (HAL-17692), a wake pick up a parked task Paperclip
 * won't wake as it is (HAL-17869) and a held head's task in any status
 * (HAL-18147), `highOnly` lets a long review wait raise
 * a task to `high` (HAL-17920), and nothing else; `setTaskLabels` lets the difficulty tagger
 * set labels and nothing else, and `assignTaskBack` lets the hand-off limit
 * set the task's agent and nothing else, because the manifest can't narrow
 * `issues.update`. The unblock sweep's own adapter is in `unblock-host.ts`.
 */

/** The part of the plugin context the adapter uses, so tests can fake it. */
export interface HostApi {
  readonly issues: Pick<
    PluginIssuesClient,
    "list" | "get" | "listComments" | "createComment" | "update" | "requestWakeup" | "monitors"
  > & { readonly relations: Pick<PluginIssuesClient["relations"], "get" | "removeBlockers"> };
  readonly agents: Pick<PluginAgentsClient, "list">;
}

/** Statuses of a task whose work isn't finished. A blocked task waits on someone else. */
const openStatuses = ["backlog", "todo", "in_progress", "in_review", "blocked"] as const;
const watchedStatuses: ReadonlySet<string> = new Set(["todo", "in_progress", "in_review"]);
/**
 * Statuses of a task put aside until something else happens, often a stacked
 * pull request's task waiting for the one below. The watcher reads them only
 * for a retargeted pull request (HAL-17869), and only wakes them.
 */
const parkedStatuses: ReadonlySet<string> = new Set(["backlog", "blocked"]);
const wakeStatuses: ReadonlySet<string> = new Set([...watchedStatuses, ...parkedStatuses]);
/** How many tasks one list call asks for. */
export const pageSize = 500;

/** The only status change the watcher may make. Anything else throws before it reaches the host. */
export function doneOnly(patch: Readonly<Record<string, unknown>>): { status: "done" } {
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== "status" || patch["status"] !== "done") {
    throw new Error(`PR watcher: refusing a task change other than done (${keys.join(", ")}).`);
  }
  return { status: "done" };
}

/**
 * The only handoff the watcher may make: the task to one agent, with status
 * `todo`, and no other field. Anything else throws before it reaches the host.
 */
export function handoffOnly(patch: Readonly<Record<string, unknown>>): {
  assigneeAgentId: string;
  status: "todo";
} {
  const keys = Object.keys(patch).sort();
  const agent = patch["assigneeAgentId"];
  if (
    keys.join(",") !== "assigneeAgentId,status" ||
    patch["status"] !== "todo" ||
    typeof agent !== "string" ||
    agent === ""
  ) {
    throw new Error(
      `PR watcher: refusing a handoff other than to one agent with status todo (${keys.join(", ")}).`,
    );
  }
  return { assigneeAgentId: agent, status: "todo" };
}

/** The only priority change the watcher may make. Anything else throws before it reaches the host. */
export function highOnly(patch: Readonly<Record<string, unknown>>): { priority: "high" } {
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== "priority" || patch["priority"] !== "high") {
    throw new Error(`PR watcher: refusing a priority change other than high (${keys.join(", ")}).`);
  }
  return { priority: "high" };
}

/** The priorities the watcher may raise; anything a person set higher stays. */
const raisablePriorities: ReadonlySet<string> = new Set(["low", "medium"]);

/**
 * The difficulty tagger's only task change (HAL-16901): the task's whole list
 * of label ids, and no other field.
 */
export async function setTaskLabels(
  issues: Pick<PluginIssuesClient, "update">,
  taskId: string,
  labelIds: readonly string[],
  companyId: string,
): Promise<void> {
  await issues.update(taskId, { labelIds: [...labelIds] }, companyId);
}

/**
 * The hand-off limit's only task change (HAL-17628): the task's agent, and no
 * other field, so its status and everything else stay as the agent left them.
 */
export async function assignTaskBack(
  issues: Pick<PluginIssuesClient, "update">,
  taskId: string,
  agentId: string,
  companyId: string,
): Promise<void> {
  await issues.update(taskId, { assigneeAgentId: agentId }, companyId);
}

/**
 * The chief line's only task change: a parked (`backlog`, `done` or `blocked`) thread back to `todo`
 * before Chief is woken on it, and no other field.
 */
export async function reopenThread(
  issues: Pick<PluginIssuesClient, "update">,
  taskId: string,
  companyId: string,
): Promise<void> {
  await issues.update(taskId, todoOnly({ status: "todo" }), companyId);
}

/**
 * The unblock sweep's only task change (`unblock-host.ts`): a blocked task
 * back to `todo`, and no other field.
 */
export async function blockedToTodo(
  issues: Pick<PluginIssuesClient, "update">,
  taskId: string,
  companyId: string,
): Promise<void> {
  await issues.update(taskId, todoOnly({ status: "todo" }), companyId);
}

/** A host time (a `Date`, or a string over the wire) as ISO, or null when there is none. */
export function isoOrNull(value: Date | string | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString();
}

/** A task as Paperclip lists it. */
export type ListedIssue = Awaited<ReturnType<HostApi["issues"]["list"]>>[number];

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
export function paperclipHost(
  host: HostApi,
  companyId: string,
  noteState?: Pick<PluginStateClient, "get">,
): Paperclip {
  return {
    async openTasks() {
      const issues = await everyIssue(host, companyId);
      const parents = new Set(issues.flatMap((issue) => issue.parentId ?? []));
      return issues
        .filter((issue) => wakeStatuses.has(issue.status) && issue.identifier !== null)
        .map(
          (issue): TaskRow => ({
            id: issue.id,
            identifier: issue.identifier ?? "",
            assigneeAgentId: issue.assigneeAgentId,
            running: issue.activeRun != null,
            ...(issue.activeRun == null ? {} : { runStatus: issue.activeRun.status }),
            openChildren: parents.has(issue.id),
            monitorNextCheckAt: isoOrNull(issue.monitorNextCheckAt),
            monitorLastTriggeredAt: isoOrNull(issue.monitorLastTriggeredAt),
            parked: parkedStatuses.has(issue.status),
            priority: issue.priority,
            blocked: issue.status === "blocked",
          }),
        );
    },
    async comments(taskId) {
      const comments = await host.issues.listComments(taskId, companyId);
      // The front bot's Automatic notes are no one's comment: never "a comment after the merge" (HAL-19136).
      const ownIds =
        noteState === undefined
          ? new Set<string>()
          : await automaticNoteIds(noteState, companyId, taskId);
      return comments
        .filter((comment) => !isAutomaticNote(comment, ownIds))
        .map(
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
    async wake(taskId, body, key, options = {}) {
      const issue = await host.issues.get(taskId, companyId);
      if (issue === null || !wakeStatuses.has(issue.status)) {
        return "closed";
      }
      if (options.todo === true && issue.status !== "todo") {
        await host.issues.update(taskId, todoOnly({ status: "todo" }), companyId);
      }
      await host.issues.createComment(taskId, body, companyId);
      // A plugin's comment wakes nobody, so the wake-up is its own call.
      const woken = await wakeAssignee(host, taskId, companyId, key);
      if (woken === "written" || !(await stillWatched(host, taskId, companyId, parkedStatuses))) {
        return woken;
      }
      // Paperclip wakes nobody on a parked task: pick it up as todo, then wake.
      await host.issues.update(taskId, todoOnly({ status: "todo" }), companyId);
      return wakeAssignee(host, taskId, companyId, key);
    },
    async markDone(taskId, body) {
      // A parked task is done too once its pull requests landed (HAL-18147).
      if (!(await stillWatched(host, taskId, companyId, wakeStatuses))) {
        return "closed";
      }
      await host.issues.update(taskId, doneOnly({ status: "done" }), companyId);
      await host.issues.createComment(taskId, body, companyId);
      return "written";
    },
    async handOff(taskId, { from, to }, body, key, options = {}) {
      // Re-read: the author may have handed it on, closed it or started a run during the pass.
      const issue = await host.issues.get(taskId, companyId);
      const run = issue?.activeRun;
      const waiting = options.overQueuedRun === true && waitingRunStatuses.has(run?.status ?? "");
      const blocking = run != null && !waiting;
      if (
        issue === null ||
        !watchedStatuses.has(issue.status) ||
        issue.assigneeAgentId !== from ||
        blocking
      ) {
        return "closed";
      }
      // The reassignment first: the comment carries the head's once-only marker, so a
      // failed reassignment after it would never hand that head off again (HAL-17690).
      await host.issues.update(
        taskId,
        handoffOnly({ assigneeAgentId: to, status: "todo" }),
        companyId,
      );
      await host.issues.createComment(taskId, body, companyId);
      // A plugin's change may not wake the new assignee, so the wake-up is its own call,
      // after the comment, so the reviewer's run finds it.
      return wakeAssignee(host, taskId, companyId, key);
    },
    async note(taskId, body) {
      if (!(await stillWatched(host, taskId, companyId))) {
        return "closed";
      }
      await host.issues.createComment(taskId, body, companyId);
      return "written";
    },
    async postponeMonitor(taskId, until) {
      // Paperclip checks the rest: only later, at most 24 hours out, an existing monitor (HAL-16413).
      const result = await host.issues.monitors.postpone(taskId, companyId, { until });
      return result.postponed ? "postponed" : "unchanged";
    },
    async raisePriority(taskId, to) {
      // Re-read: a person may have set the priority or closed the task during the pass.
      const issue = await host.issues.get(taskId, companyId);
      if (
        issue === null ||
        !watchedStatuses.has(issue.status) ||
        !raisablePriorities.has(issue.priority)
      ) {
        return "closed";
      }
      await host.issues.update(taskId, highOnly({ priority: to }), companyId);
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
async function stillWatched(
  host: HostApi,
  taskId: string,
  companyId: string,
  statuses = watchedStatuses,
): Promise<boolean> {
  const issue = await host.issues.get(taskId, companyId);
  return issue !== null && statuses.has(issue.status);
}

/** The only status change the sweep may make. Anything else throws before it reaches the host. */
export function todoOnly(patch: Readonly<Record<string, unknown>>): { status: "todo" } {
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== "status" || patch["status"] !== "todo") {
    throw new Error(`Unblock: refusing a task change other than todo (${keys.join(", ")}).`);
  }
  return { status: "todo" };
}
