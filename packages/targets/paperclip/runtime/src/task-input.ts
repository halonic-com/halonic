/**
 * Reading the Paperclip actions' parameters, ported from the task tools in
 * `tooling/paperclip` (HAL-16403) with the same limits and wording. A
 * mistake in them is a `ToolInputError`, whose message goes back to the
 * agent as it is.
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

/** The longest comment `paperclip.comment` posts; a longer one belongs in a document. */
export const maxCommentLength = 20_000;

/** `paperclip.comment`'s parameters: the task and a body that isn't empty or too long. */
export function readCommentParams(params: unknown): { task: string; body: string } {
  const task = readTask(params);
  const { body } = (params ?? {}) as { body?: unknown };
  if (typeof body !== "string" || body.trim() === "") {
    throw new ToolInputError("body must be the comment's text.");
  }
  if (body.length > maxCommentLength) {
    throw new ToolInputError(
      `body is ${body.length} characters; the most is ${maxCommentLength}. Put a longer text in a document.`,
    );
  }
  return { task, body };
}
