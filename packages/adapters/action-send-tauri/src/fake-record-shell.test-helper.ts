import { checkActionEvent } from "@halonicjs/events";
import type { ActionShell } from "./shell.ts";

/** One `invoke` as it reached the fake shell. */
export interface RecordCall {
  command: string;
  args: Record<string, unknown>;
}

/**
 * A mocked Tauri `invoke` that answers like the shell's
 * `action_record_append` and `action_record_read`
 * (`apps/studio/src-tauri/src/action_records.rs`): it keeps each request's
 * events as JSON lines, refuses what `halonic-action-send`'s allow-list
 * refuses as `refused-event` without writing it, and sends every answer
 * through JSON, as the IPC does. Like Tauri, it reads each argument by name:
 * a missing one is refused as `invalid_args`, an extra one is ignored.
 * `answers` replaces a command's answer and `refusals` rejects it, so a test
 * can give the adapter what a broken or newer shell would.
 */
export class FakeRecordShell implements Pick<ActionShell, "invoke"> {
  readonly calls: RecordCall[] = [];
  readonly answers = new Map<string, unknown>();
  readonly refusals = new Map<string, unknown>();
  readonly #lines = new Map<string, string[]>();

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args });
    if (this.refusals.has(command)) throw this.refusals.get(command);
    const answer = this.answers.has(command) ? this.answers.get(command) : this.#run(command, args);
    return answer === undefined ? null : JSON.parse(JSON.stringify(answer));
  }

  #run(command: string, args: Record<string, unknown>): unknown {
    if (command === "action_record_append" && "event" in args) return this.#append(args["event"]);
    if (command === "action_record_read" && typeof args["request"] === "string") {
      return (this.#lines.get(args["request"]) ?? []).map((line) => JSON.parse(line));
    }
    throw { kind: "invalid_args", message: `${command} is missing an argument` };
  }

  #append(event: unknown): undefined {
    const check = checkActionEvent(event);
    if (!check.ok || check.event.type === "action.requested") {
      throw { kind: "refused-event", message: "action event refused" };
    }
    const lines = this.#lines.get(check.event.request) ?? [];
    lines.push(JSON.stringify(event));
    this.#lines.set(check.event.request, lines);
    return undefined;
  }
}
