import type { InstructionTrustKey, InstructionTrustRecord } from "@halonicjs/ports";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { TauriShell, TrustRefusal, TrustRefusalKind } from "./shell.ts";

/**
 * A shell that answers the `instruction_trust_*` commands as the Rust shell
 * does, written out on its own rather than from the adapter: records kept as
 * JSON text by key, a damaged record refused as `unreadable`, and a save made
 * only when the person says yes to the question the shell asks itself.
 *
 * Every call is kept in `calls`, and every question in `asked`.
 */
export class FakeInstructionTrustShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** The records the shell asked the person about, in order. */
  readonly asked: InstructionTrustRecord[] = [];
  /** What the person says when the shell asks; `true` when the list runs out. */
  readonly answers: boolean[] = [];
  readonly #files = new Map<string, string>();
  readonly #granted: boolean;
  #nextRefusal: TrustRefusalKind | undefined;

  /** @param options.granted - whether the page has the capability for these commands */
  constructor(options: { granted?: boolean } = {}) {
    this.#granted = options.granted ?? true;
  }

  /** Makes the stored record for `key` unreadable, as a cut-off file is (the contract only damages records it saved). */
  damage(key: InstructionTrustKey): void {
    this.#files.set(idOf(key), "{");
  }

  /** Makes the next call fail this way, before anything is read or written. */
  refuseNext(kind: TrustRefusalKind): void {
    this.#nextRefusal = kind;
  }

  async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (!this.#granted) {
      // What Tauri rejects with for a command the capability doesn't allow: text, not a refusal.
      throw `Command ${command} not allowed by ACL`;
    }
    if (this.#nextRefusal !== undefined) {
      const kind = this.#nextRefusal;
      this.#nextRefusal = undefined;
      throw refusal(kind, `refused by the test (${kind})`);
    }
    switch (command) {
      case "instruction_trust_get":
        return this.#read(args?.["key"] as InstructionTrustKey);
      case "instruction_trust_save":
        return this.#save(args?.["record"] as InstructionTrustRecord);
      case "instruction_trust_remove":
        this.#files.delete(idOf(args?.["key"] as InstructionTrustKey));
        return null;
      default:
        throw `Command ${command} not found`;
    }
  }

  #read(key: InstructionTrustKey): unknown {
    const text = this.#files.get(idOf(key));
    if (text === undefined) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw refusal("unreadable", "the record file is damaged");
    }
  }

  #save(record: InstructionTrustRecord): null {
    this.asked.push(record);
    if (!(this.answers.shift() ?? true)) {
      throw refusal("declined", "the person said no");
    }
    this.#files.set(idOf(record), JSON.stringify(record));
    return null;
  }
}

function idOf(key: InstructionTrustKey): string {
  return JSON.stringify([key.location, key.agent]);
}

function refusal(kind: TrustRefusalKind, message: string): TrustRefusal {
  return { kind, message };
}
