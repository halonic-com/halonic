import type { PluginEvent } from "@paperclipai/plugin-sdk";

/**
 * Shared by the handlers of `issue.created` and `issue.updated` (task effort,
 * difficulty tagger): which task an event is about, and one event per task
 * at a time.
 */

/** The id of the task an issue event is about, or undefined when it names none. */
export function taskIdOf(event: PluginEvent): string | undefined {
  const payload = (event.payload ?? {}) as { id?: unknown };
  return event.entityId ?? (typeof payload.id === "string" ? payload.id : undefined);
}

/**
 * Runs work for one task after the work already queued for that task, so a
 * handler reads the `issue.updated` its own write causes only after it saved
 * what it wrote. Tasks don't wait for each other.
 */
export function perTaskQueue(): (taskId: string, work: () => Promise<void>) => Promise<void> {
  const running = new Map<string, Promise<void>>();
  return async (taskId, work) => {
    const next = (running.get(taskId) ?? Promise.resolve()).then(work);
    running.set(taskId, next);
    await next;
    if (running.get(taskId) === next) {
      running.delete(taskId);
    }
  };
}
