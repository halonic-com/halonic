import type { RunEvent } from "./run-event.ts";

/**
 * Read a stored event, upgrading older shapes. Run logs written before
 * workflows were renamed have `flowId` on `run.started`, and logs written
 * before hubs were renamed have `projectId`. Both become today's names.
 * Every other event is returned as it is.
 *
 * @param raw - one event as read from a run log
 * @returns the event in today's shape
 *
 * @example
 * upgradeEvent({ type: "run.started", projectId: "p", flowId: "greet", ... });
 * // => { type: "run.started", hubId: "p", workflowId: "greet", ... }
 */
export function upgradeEvent(raw: unknown): RunEvent {
  // Stored logs are trusted to be run events; only the old names are fixed up.
  const event = raw as RunEvent;
  if (event.type !== "run.started") return event;
  const fields = raw as Record<string, unknown>;
  const withWorkflow = renameOldField(fields, "flowId", "workflowId");
  return renameOldField(withWorkflow, "projectId", "hubId") as unknown as RunEvent;
}

/**
 * Parse one line of a JSON-lines run log.
 *
 * @param line - one line of the log, without the line break
 * @returns the event, upgraded by {@link upgradeEvent}
 * @throws SyntaxError when the line isn't valid JSON or isn't a JSON object
 */
export function parseEventLine(line: string): RunEvent {
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SyntaxError("A run log line must be a JSON object");
  }
  return upgradeEvent(parsed);
}

/**
 * Move a string field to its new name. Only when the new name isn't set yet,
 * so an event that already has both keeps both.
 */
function renameOldField(
  fields: Record<string, unknown>,
  oldName: string,
  newName: string,
): Record<string, unknown> {
  if (fields[newName] !== undefined) return fields;
  const oldValue = fields[oldName];
  if (typeof oldValue !== "string") return fields;
  const { [oldName]: _removed, ...rest } = fields;
  return { ...rest, [newName]: oldValue };
}
