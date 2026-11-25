import { ancestorIds, finished, parentBlockers } from "./parent-block.ts";

/**
 * Moves a blocked task back to `todo`, and wakes its agent, once everything
 * in its "blocked by" is done or cancelled (HAL-17692). Paperclip keeps such
 * a task `blocked` and wakes nobody, so the work behind a merged pull request
 * sat for hours. This belongs in Paperclip itself, when a blocker closes;
 * until it is there, the watcher sweeps every pass, so it also catches
 * blockers that someone else closed.
 */

/** A blocked task, as the sweep reads it. */
export interface BlockedRow {
  readonly id: string;
  readonly identifier: string;
  /** Only an agent's task is moved: a person's blocked task waits on them. */
  readonly assigneeAgentId: string | null;
  /** A run of its assignee is queued or running, so it can unblock itself. */
  readonly running: boolean;
}

/** One task in its "blocked by". */
export interface BlockerRow {
  readonly id: string;
  readonly identifier: string | null;
  readonly status: string;
}

/** What the sweep needs from Paperclip. */
export interface UnblockPaperclip {
  blockedTasks(): Promise<BlockedRow[]>;
  blockers(taskId: string): Promise<BlockerRow[]>;
  /**
   * Sets the task to `todo`, comments and wakes its agent, only if it is still
   * blocked; `closed` when it no longer was by the time of the write.
   */
  unblock(taskId: string, body: string, key: string): Promise<"written" | "closed">;
  /** The task's parent, or null for a task at the top. */
  parentOf(taskId: string): Promise<string | null>;
  /**
   * Removes `removed`, the task's parent or tasks above it, from its "blocked
   * by" and comments why; when nothing unfinished is left, also sets `todo`
   * and wakes its agent (`parent_block`). Only if the task is still blocked
   * by all of them; `closed` when it no longer was by the time of the write.
   */
  releaseParentBlock(
    taskId: string,
    removed: readonly BlockerRow[],
  ): Promise<"todo" | "blocked" | "closed">;
}

/** How a sweep went. */
export interface UnblockSummary {
  readonly unblocked: number;
  /** Tasks whose parent, or a task above it, was removed from their "blocked by" (`parent_block`). */
  readonly parentBlocks: number;
  readonly failed: readonly string[];
}

/** Whether the task may go back to `todo`: it waits on at least one task, and all of them are finished. */
export function readyToUnblock(blockers: readonly BlockerRow[]): boolean {
  return blockers.length > 0 && blockers.every((blocker) => finished.has(blocker.status));
}

/** The comment that unblocks the task, naming what it waited on. */
export function unblockMessage(blockers: readonly BlockerRow[]): string {
  const names = blockers.map((blocker) => `${blocker.identifier ?? blocker.id} ${blocker.status}`);
  return `PR watcher: everything this task was blocked by is finished (${names.join(", ")}), so it's back to \`todo\`.`;
}

/** The same unblock again is a no-op: the key names the task and what it waited on. */
function unblockKey(blockers: readonly BlockerRow[]): string {
  return `unblock ${blockers
    .map((blocker) => blocker.id)
    .sort()
    .join(",")}`;
}

/** What the sweep did with one task. */
type TaskOutcome = "unblocked" | "parent_block" | "skipped";

/**
 * A task blocked by its own parent or a task above it (`parent_block`): the
 * link goes, and the task goes to `todo` if nothing else unfinished holds it.
 * Parents are read only for a task with an unfinished blocker.
 */
async function releaseParentBlock(
  paperclip: UnblockPaperclip,
  task: BlockedRow,
  blockers: readonly BlockerRow[],
  options: { readonly dryRun: boolean; readonly log: (line: string) => void },
): Promise<TaskOutcome | undefined> {
  if (blockers.every((blocker) => finished.has(blocker.status))) {
    return undefined;
  }
  const removed = parentBlockers(
    blockers,
    await ancestorIds(task.id, (id) => paperclip.parentOf(id)),
  );
  if (removed.length === 0) {
    return undefined;
  }
  const names = removed.map((blocker) => blocker.identifier ?? blocker.id).join(", ");
  options.log(
    `${task.identifier}: parent_block, blocked by ${names} above it${options.dryRun ? " (dry run)" : ""}`,
  );
  if (options.dryRun) {
    return "parent_block";
  }
  if ((await paperclip.releaseParentBlock(task.id, removed)) === "closed") {
    options.log(
      `${task.identifier}: no longer blocked by ${names} during this pass, so left alone`,
    );
    return "skipped";
  }
  return "parent_block";
}

async function sweepTask(
  paperclip: UnblockPaperclip,
  task: BlockedRow,
  options: { readonly dryRun: boolean; readonly log: (line: string) => void },
): Promise<TaskOutcome> {
  const blockers = await paperclip.blockers(task.id);
  const parentBlock = await releaseParentBlock(paperclip, task, blockers, options);
  if (parentBlock !== undefined) {
    return parentBlock;
  }
  if (!readyToUnblock(blockers)) {
    return "skipped";
  }
  const body = unblockMessage(blockers);
  options.log(`${task.identifier}: unblock${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return "unblocked";
  }
  if ((await paperclip.unblock(task.id, body, unblockKey(blockers))) === "closed") {
    options.log(`${task.identifier}: no longer blocked during this pass, so left alone`);
    return "skipped";
  }
  return "unblocked";
}

/**
 * One sweep over the blocked tasks. A task that fails is logged and skipped,
 * so one broken task doesn't stop the others.
 */
export async function unblockPass(options: {
  readonly paperclip: UnblockPaperclip;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}): Promise<UnblockSummary> {
  const { paperclip, log } = options;
  let unblocked = 0;
  let parentBlocks = 0;
  const failed: string[] = [];
  for (const task of await paperclip.blockedTasks()) {
    if (task.assigneeAgentId === null || task.running) {
      continue;
    }
    try {
      const outcome = await sweepTask(paperclip, task, options);
      unblocked += outcome === "unblocked" ? 1 : 0;
      parentBlocks += outcome === "parent_block" ? 1 : 0;
    } catch (error) {
      failed.push(task.identifier);
      log(`${task.identifier}: couldn't unblock it: ${(error as Error).message}`);
    }
  }
  return { unblocked, parentBlocks, failed };
}
