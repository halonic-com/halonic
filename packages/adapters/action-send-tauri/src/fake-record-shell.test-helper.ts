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
 * refuses as `refused-event` without writing it, refuses any other argument
 * as serde would, and sends every answer through JSON, as the IPC does.
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
    const names = Object.keys(args);
    const name = names.length === 1 ? names[0] : undefined;
    if (command === "action_record_append" && name === "event") return this.#append(args[name]);
    if (command === "action_record_read" && name === "request") {
      return (this.#lines.get(String(args[name])) ?? []).map((line) => JSON.parse(line));
    }
    throw { kind: "invalid_args", message: `${command} doesn't take ${Object.keys(args)}` };
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
