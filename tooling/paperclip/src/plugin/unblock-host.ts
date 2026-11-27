import type { PluginStateClient } from "@paperclipai/plugin-sdk";
import {
  ancestorIds,
  finished,
  parentBlockers,
  parentBlockKey,
  parentBlockMessage,
} from "../pr-watcher/parent-block.ts";
import {
  type BlockedRow,
  type BlockerRow,
  shouldUnblock,
  type UnblockPaperclip,
} from "../pr-watcher/unblock.ts";
import { blockedToTodo, type HostApi, isoOrNull, pageSize } from "./host.ts";

/**
 * The unblock sweep's Paperclip, on top of the plugin host's API (HAL-17692).
 * Its only task changes are `todo` on a blocked task (`blockedToTodo`) and removing
 * a task's parent, or a task above it, from its "blocked by" (`parent_block`),
 * each re-read right before the write. It remembers the last unblock it wrote
 * on each task in plugin state, so it never writes the same one twice
 * (HAL-20169).
 */

type StateGetSet = Pick<PluginStateClient, "get" | "set">;

/** What the sweep remembers about a task: the key of the last unblock it wrote there. */
interface UnblockRecord {
  readonly companyId: string;
  readonly key: string;
}

function lastUnblockKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "pr-watcher",
    stateKey: "last-unblock",
  } as const;
}

/** The key of the last unblock on a task of this company; null for none, or a task of another company. */
async function readLastUnblock(
  state: StateGetSet,
  companyId: string,
  taskId: string,
): Promise<string | null> {
  const record = (await state.get(lastUnblockKey(taskId))) as UnblockRecord | null;
  return record !== null && record.companyId === companyId ? record.key : null;
}

/** When a finished blocker was done or cancelled; null for an unfinished one, or when Paperclip doesn't say. */
async function finishedAt(
  host: HostApi,
  companyId: string,
  blocker: { readonly id: string; readonly status: string },
): Promise<string | null> {
  if (!finished.has(blocker.status)) {
    return null;
  }
  const issue = await host.issues.get(blocker.id, companyId);
  return isoOrNull(issue?.completedAt ?? issue?.cancelledAt);
}

/**
 * A task's "blocked by". When all of them are finished, each comes with when it
 * finished, read one by one since the relation list doesn't carry that; before
 * then the times decide nothing, so the sweep doesn't spend a read on them.
 */
async function blockersOf(host: HostApi, taskId: string, companyId: string) {
  const relations = await host.issues.relations.get(taskId, companyId);
  const allFinished = relations.blockedBy.every((blocker) => finished.has(blocker.status));
  const blockers: BlockerRow[] = [];
  for (const blocker of relations.blockedBy) {
    blockers.push({
      id: blocker.id,
      identifier: blocker.identifier,
      status: blocker.status,
      finishedAt: allFinished ? await finishedAt(host, companyId, blocker) : null,
    });
  }
  return blockers;
}

/** A sweep's Paperclip for one company, with the plugin state it remembers its unblocks in. */
export function unblockHost(
  host: HostApi,
  companyId: string,
  state: StateGetSet,
): UnblockPaperclip {
  return {
    async blockedTasks() {
      const tasks: BlockedRow[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = await host.issues.list({
          companyId,
          status: "blocked",
          limit: pageSize,
          offset,
        });
        tasks.push(
          ...page
            .filter((issue) => issue.identifier !== null)
            .map(
              (issue): BlockedRow => ({
                id: issue.id,
                identifier: issue.identifier ?? "",
                assigneeAgentId: issue.assigneeAgentId,
                running: issue.activeRun != null,
                blockedSince: isoOrNull(issue.blockedTransitionAt),
              }),
            ),
        );
        if (page.length < pageSize) {
          return tasks;
        }
      }
    },
    blockers: (taskId) => blockersOf(host, taskId, companyId),
    lastUnblock: (taskId) => readLastUnblock(state, companyId, taskId),
    async unblock(taskId, body, key) {
      // Re-read right before the write: someone may have moved it, set it to blocked
      // again, or added a blocker, during the pass.
      const issue = await host.issues.get(taskId, companyId);
      const blockers = await blockersOf(host, taskId, companyId);
      const blockedSince = isoOrNull(issue?.blockedTransitionAt);
      if (issue?.status !== "blocked" || !shouldUnblock(blockedSince, blockers)) {
        return "closed";
      }
      await blockedToTodo(host.issues, taskId, companyId);
      await host.issues.createComment(taskId, body, companyId);
      // A plugin's comment and status change wake nobody, so the wake-up is its own call.
      await host.issues.requestWakeup(taskId, companyId, {
        reason: "blockers_finished",
        idempotencyKey: `pr-watcher ${taskId} ${key}`,
      });
      // Remembered last, so a failed write above leaves the next pass free to try again.
      await state.set(lastUnblockKey(taskId), { companyId, key } satisfies UnblockRecord);
      return "written";
    },
    async parentOf(taskId) {
      return (await host.issues.get(taskId, companyId))?.parentId ?? null;
    },
    releaseParentBlock: (taskId, removed) => releaseParentBlock(host, companyId, taskId, removed),
  };
}

/**
 * Removes a task's parent, or a task above it, from its "blocked by"
 * (`parent_block`), after reading the task, its blockers and its parents
 * again: only blockers that are still there, unfinished and above it go.
 */
async function releaseParentBlock(
  host: HostApi,
  companyId: string,
  taskId: string,
  removed: readonly BlockerRow[],
): Promise<"todo" | "blocked" | "closed"> {
  const issue = await host.issues.get(taskId, companyId);
  const blockers = await blockersOf(host, taskId, companyId);
  const above = await ancestorIds(
    taskId,
    async (id) => (await host.issues.get(id, companyId))?.parentId ?? null,
  );
  const stillThere = parentBlockers(blockers, above).map((blocker) => blocker.id);
  if (issue?.status !== "blocked" || !removed.every((blocker) => stillThere.includes(blocker.id))) {
    return "closed";
  }
  const ids = removed.map((blocker) => blocker.id);
  await host.issues.relations.removeBlockers(taskId, ids, companyId);
  const rest = blockers.filter((blocker) => !ids.includes(blocker.id));
  const backToTodo = rest.every((blocker) => finished.has(blocker.status));
  if (backToTodo) {
    await blockedToTodo(host.issues, taskId, companyId);
  }
  await host.issues.createComment(taskId, parentBlockMessage(removed, backToTodo), companyId);
  if (!backToTodo) {
    return "blocked";
  }
  // A plugin's comment and status change wake nobody, so the wake-up is its own call.
  await host.issues.requestWakeup(taskId, companyId, {
    reason: "parent_block",
    idempotencyKey: `pr-watcher ${taskId} ${parentBlockKey(removed)}`,
  });
  return "todo";
}
