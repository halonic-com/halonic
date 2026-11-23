/**
 * The PR watcher's view of Paperclip. The plugin's host adapter
 * (`src/plugin/host.ts`) implements it; it reads tasks, comments and agents,
 * and writes only comments, wake-ups, a task's `done` status and a later
 * time for a monitor the task already has.
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
 * watcher got to it (its author closed it during the pass), so nothing needed doing.
 */
export type WriteOutcome = "written" | "closed";

/** What moving a monitor did: `unchanged` when it was already due at that time or later. */
export type PostponeOutcome = "postponed" | "unchanged";

/** The watcher's view of Paperclip. */
export interface Paperclip {
  openTasks(): Promise<TaskRow[]>;
  comments(taskId: string): Promise<CommentRow[]>;
  agents(): Promise<AgentRow[]>;
  /** Comments and wakes the task's assignee. `key` makes a repeated wake-up a no-op. */
  wake(taskId: string, body: string, key: string): Promise<WriteOutcome>;
  markDone(taskId: string, body: string): Promise<WriteOutcome>;
  /**
   * Moves the task's existing monitor to `until`. Paperclip refuses (throws)
   * anything but a later time within 24 hours on an in-progress or in-review task.
   */
  postponeMonitor(taskId: string, until: string): Promise<PostponeOutcome>;
}
