import type { BlockerRow } from "./unblock.ts";

/**
 * The `parent_block` rule (board, via HAL-10, 25 Nov): a task blocked by its
 * own parent, or by any task above it, waits forever, because the parent
 * can't finish before its child does. HAL-18142 sat blocked by its parent
 * HAL-17956 that way. The unblock sweep removes such a link and, when nothing
 * else unfinished holds the task, moves it back to `todo`. The watchers'
 * read-only `parent_block` check reports the same cases.
 */

/** The statuses of a blocker that no longer holds anything up. */
export const finished: ReadonlySet<string> = new Set(["done", "cancelled"]);

/** How far up the sweep follows a task's parents; deeper trees are cut off rather than read forever. */
export const maxAncestorDepth = 20;

/** The unfinished blockers that are the task's own parent or a task above it. */
export function parentBlockers(
  blockers: readonly BlockerRow[],
  ancestorIds: ReadonlySet<string>,
): BlockerRow[] {
  return blockers.filter((blocker) => !finished.has(blocker.status) && ancestorIds.has(blocker.id));
}

/**
 * The ids above a task, nearest first, read one parent at a time. Stops at
 * the top, at `maxAncestorDepth`, or at a task seen before, so a parent loop
 * in Paperclip's data can't keep the sweep busy.
 */
export async function ancestorIds(
  taskId: string,
  parentOf: (taskId: string) => Promise<string | null>,
): Promise<Set<string>> {
  const found = new Set<string>();
  let current = await parentOf(taskId);
  while (current !== null && current !== taskId && !found.has(current)) {
    found.add(current);
    if (found.size >= maxAncestorDepth) {
      break;
    }
    current = await parentOf(current);
  }
  return found;
}

/** The comment that explains the removed link, and whether the task is back to `todo`. */
export function parentBlockMessage(removed: readonly BlockerRow[], backToTodo: boolean): string {
  const names = removed.map((blocker) => blocker.identifier ?? blocker.id).join(", ");
  const next = backToTodo
    ? "Nothing else unfinished blocks it, so it's back to `todo`."
    : "Other unfinished blockers remain, so it stays blocked.";
  return `PR watcher: this task was blocked by ${names}, which is above it in the task tree. A parent can't finish before its child, so that was a deadlock (\`parent_block\`) and the link is removed. ${next}`;
}

/** The same removal again is a no-op: the key names the task's removed blockers. */
export function parentBlockKey(removed: readonly BlockerRow[]): string {
  return `parent-block ${removed
    .map((blocker) => blocker.id)
    .sort()
    .join(",")}`;
}
