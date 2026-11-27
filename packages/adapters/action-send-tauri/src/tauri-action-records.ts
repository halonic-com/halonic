import { type ActionRecordEvent, checkActionEvent } from "@halonicjs/events";
import type { ActionRecords } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { malformedAnswer, shellFailure } from "./action-shell-error.ts";
import { type ActionShell, actionCommands } from "./shell.ts";

/** The shell's kind for an event its allow-list refused. */
const refusedEvent = "refused-event";

/**
 * The {@link ActionRecords} of the desktop Studio, over the shell's
 * `action_record_append` and `action_record_read` (requirement
 * `action-send-tauri.records`). The shell keeps each request's record in
 * a file only the user can read, checks every event against the same
 * allow-list, and deletes a finished record 90 days after its
 * `action.finished`. This adapter checks each event before it sends it and
 * each event it reads back, so an event the allow-list refuses never
 * reaches the shell, and one the shell hands back never reaches the page.
 *
 * An event the allow-list refuses, or a request id the shell refuses,
 * rejects with a `RangeError`, as the port says; any other failure of the
 * shell rejects with an `ActionShellError`.
 *
 * @example
 * const records = new TauriActionRecords(shell);
 * await records.append({ type: "action.step.started", request: "req-1", at: "2026-11-25T09:00:00.000Z", step: 1 });
 */
export class TauriActionRecords implements ActionRecords {
  readonly #shell: Pick<ActionShell, "invoke">;

  /** @param shell - the page's IPC into the shell, from `studio/services` */
  constructor(shell: Pick<ActionShell, "invoke">) {
    this.#shell = shell;
  }

  async append(event: ActionRecordEvent): Promise<void> {
    const problem = recordProblem(event);
    if (problem !== undefined) throw new RangeError(`Action event refused: ${problem}`);
    const command = actionCommands.recordAppend;
    try {
      await this.#shell.invoke(command, { event });
    } catch (error) {
      throw refusalOf(command, error, "Action event");
    }
  }

  async read(request: string): Promise<readonly ActionRecordEvent[]> {
    const command = actionCommands.recordRead;
    let answer: unknown;
    try {
      answer = await this.#shell.invoke(command, { request });
    } catch (error) {
      throw refusalOf(command, error, "Request id");
    }
    if (!Array.isArray(answer)) throw malformedAnswer(command);
    const events: ActionRecordEvent[] = [];
    for (const value of answer as unknown[]) {
      if (recordProblem(value) !== undefined) throw malformedAnswer(command);
      const event = value as ActionRecordEvent;
      // Another request's event in this record is as wrong as a malformed one.
      if (event.request !== request) throw malformedAnswer(command);
      events.push(event);
    }
    return events;
  }
}

/**
 * What a failed record call rejects with: a `RangeError` when the shell's
 * allow-list refused the event or the request id, as for one the adapter
 * refuses itself, and an `ActionShellError` for anything else.
 */
function refusalOf(command: string, error: unknown, what: string): Error {
  if (isPlainObject(error) && error["kind"] === refusedEvent) {
    return new RangeError(`${what} refused by the shell: ${String(error["message"])}`);
  }
  return shellFailure(command, error);
}

/** Why `value` can't go in a record: the allow-list's problems, or that a request is a run event. */
function recordProblem(value: unknown): string | undefined {
  const check = checkActionEvent(value);
  if (!check.ok) return check.problems.join("; ");
  return check.event.type === "action.requested" ? "a request is a run event" : undefined;
}
