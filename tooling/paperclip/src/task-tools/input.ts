/**
 * Reading the task tools' parameters (HAL-16403). A mistake in them is a
 * `ToolInputError`, whose message goes back to the agent as it is.
 */

/** A mistake in the agent's parameters: its message goes back to the agent as it is. */
export class ToolInputError extends Error {}

const taskPattern = /^[A-Z][A-Z0-9]*-\d+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a task identifier such as HAL-16403 or a task id. */
export function isTaskRef(value: string): boolean {
  return taskPattern.test(value) || uuidPattern.test(value);
}

/** `task` as an identifier such as HAL-16403 or a task id; throws for anything else. */
export function readTask(params: unknown): string {
  const { task } = (params ?? {}) as { task?: unknown };
  const value = typeof task === "string" ? task.trim() : "";
  if (!isTaskRef(value)) {
    throw new ToolInputError("task must be a task identifier, such as HAL-16403, or its id.");
  }
  return value;
}
