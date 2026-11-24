/**
 * The PR watcher's view of Paperclip. The plugin's host adapter
 * (`src/plugin/host.ts`) implements it; it reads tasks, comments and agents,
 * and writes only comments, wake-ups, a task's `done` status, a handoff of
 * a task to its reviewer with status `todo`, a later time for a monitor
 * the task already has, and a raise of a task's priority to `high`.
 */

/** An open task, as the watcher reads it. */
export interface TaskRow {
  readonly id: string;
  readonly identifier: string;
  readonly assigneeAgentId: string | null;
  readonly running: boolean;
  /** It has a child task that isn't done or cancelled. */
  readonly openChildren: boolean;
  /** When its Paperclip monitor checks next, as an ISO time, or null without one. */
  readonly monitorNextCheckAt: string | null;
  /** When its monitor last fired, as an ISO time, or null. */
  readonly monitorLastTriggeredAt: string | null;
  /** It is in `backlog` or `blocked`: only a retargeted pull request wakes its holder (HAL-17869). */
  readonly parked?: boolean;
  /** Its Paperclip priority (`critical`, `high`, `medium` or `low`); unset when unknown. */
  readonly priority?: string;
}

/** A task comment: who wrote it, when, and what it says. */
export interface CommentRow {
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly createdAt: string;
  readonly body: string;
}

/** An agent: its id and the short name its branches start with. */
export interface AgentRow {
  readonly id: string;
  readonly urlKey: string;
}

/**
 * What a write did: `closed` when the task was no longer open by the time the
 * watcher got to it (its author closed it during the pass), so nothing needed
 * doing. A handoff is also `closed` when the author no longer holds the task
 * or has a run going on it.
 */
export type WriteOutcome = "written" | "closed";

/** What moving a monitor did: `unchanged` when it was already due at that time or later. */
export type PostponeOutcome = "postponed" | "unchanged";

/** The watcher's view of Paperclip. */
export interface Paperclip {
  openTasks(): Promise<TaskRow[]>;
  comments(taskId: string): Promise<CommentRow[]>;
  agents(): Promise<AgentRow[]>;
  /**
   * Comments and wakes the task's assignee. `key` makes a repeated wake-up a
   * no-op. A parked task is moved to `todo` only when Paperclip won't wake it
   * as it is.
   */
  wake(taskId: string, body: string, key: string): Promise<WriteOutcome>;
  markDone(taskId: string, body: string): Promise<WriteOutcome>;
  /**
   * Comments, then gives the task to the reviewer `to` with status `todo` and
   * wakes them, if the author `from` still holds it with no run going.
   * `key` makes a repeated wake-up a no-op.
   */
  handOff(
    taskId: string,
    change: { readonly from: string; readonly to: string },
    body: string,
    key: string,
  ): Promise<WriteOutcome>;
  /** Comments on the task and wakes nobody. */
  note(taskId: string, body: string): Promise<WriteOutcome>;
  /**
   * Moves the task's existing monitor to `until`. Paperclip refuses (throws)
   * anything but a later time within 24 hours on an in-progress or in-review task.
   */
  postponeMonitor(taskId: string, until: string): Promise<PostponeOutcome>;
  /**
   * Sets the task's priority to `high` if it is still open and `low` or
   * `medium` when re-read; `closed` otherwise, so a person's change during
   * the pass stays. Wakes nobody (HAL-17920).
   */
  raisePriority(taskId: string, to: "high"): Promise<WriteOutcome>;
}
