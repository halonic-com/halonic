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
}

/** How a sweep went. */
export interface UnblockSummary {
  readonly unblocked: number;
  readonly failed: readonly string[];
}

const finished: ReadonlySet<string> = new Set(["done", "cancelled"]);

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

/**
 * One sweep over the blocked tasks. A task that fails is logged and skipped,
 * so one broken task doesn't stop the others.
 */
export async function unblockPass(options: {
  readonly paperclip: UnblockPaperclip;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}): Promise<UnblockSummary> {
  const { paperclip, dryRun, log } = options;
  let unblocked = 0;
  const failed: string[] = [];
  for (const task of await paperclip.blockedTasks()) {
    if (task.assigneeAgentId === null || task.running) {
      continue;
    }
    try {
      const blockers = await paperclip.blockers(task.id);
      if (!readyToUnblock(blockers)) {
        continue;
      }
      const body = unblockMessage(blockers);
      log(`${task.identifier}: unblock${dryRun ? " (dry run)" : ""}\n${body}`);
      if (dryRun) {
        unblocked += 1;
        continue;
      }
      if ((await paperclip.unblock(task.id, body, unblockKey(blockers))) === "closed") {
        log(`${task.identifier}: no longer blocked during this pass, so left alone`);
        continue;
      }
      unblocked += 1;
    } catch (error) {
      failed.push(task.identifier);
      log(`${task.identifier}: couldn't unblock it: ${(error as Error).message}`);
    }
  }
  return { unblocked, failed };
}
