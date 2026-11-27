import type { LiveEvent } from "./live-messages.ts";

/**
 * The tasks live events named since the Inbox last read cards (`paperclip-client.event-card-reads`).
 * Paperclip sends a new card's event before it moves the task's `updatedAt`, so the read the event
 * brings can find the task unchanged; the Inbox reads the cards of every task named here again,
 * whatever its `updatedAt` says. One per connection, shared by its events socket and its provider.
 * The event only names the task: its cards are read over the normal routes, and only while the
 * task is in the open-task list.
 */
export class LiveTaskChanges {
  #tasks = new Set<string>();

  /** Notes the task `event` names; an event on anything else names none. */
  heard(event: LiveEvent): void {
    if (event.kind === "activity" && event.entityType === "issue") {
      this.#tasks.add(event.entityId);
    }
  }

  /** The tasks named since the last take, which are then forgotten. */
  take(): ReadonlySet<string> {
    const taken = this.#tasks;
    this.#tasks = new Set();
    return taken;
  }

  /** Names `tasks` again, after a read that failed before it read their cards. */
  restore(tasks: Iterable<string>): void {
    for (const task of tasks) {
      this.#tasks.add(task);
    }
  }
}
