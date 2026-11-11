import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { RecordRefusal, RecordRefusalKind } from "./record-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * A shell that answers the `record_*` commands as the Rust shell does,
 * written out on its own rather than from the adapter: one record folder
 * per workspace, each collection's log kept as text, its version the
 * SHA-256 of the text. It answers only for a workspace in `opened`, appends
 * only whole lines of changes to the named collection, all of a call's or
 * none, and replaces a log only at the version named.
 *
 * Every call is kept in `calls`.
 */
export class FakeRecordShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** The folders the person opened in the shell. */
  readonly opened: readonly string[];
  readonly #folders = new Map<string, Map<string, string>>();
  readonly #granted: boolean;
  #nextRefusal: RecordRefusalKind | undefined;
  #beforeReplace: (() => void) | undefined;

  /**
   * @param options.opened - the folders the person opened in the shell
   * @param options.granted - whether the page has the capability for the record commands; the served Studio doesn't
   */
  constructor(options: { opened: readonly string[]; granted?: boolean }) {
    this.opened = [...options.opened];
    this.#granted = options.granted ?? true;
  }

  /** Writes a collection's log directly, as the CLI or a damaged disk leaves it. */
  plant(workspace: string, collection: string, lines: string): void {
    this.#folder(workspace).set(collection, lines);
  }

  /** A collection's log as it is on disk, `undefined` when there is none. */
  log(workspace: string, collection: string): string | undefined {
    return this.#folder(workspace).get(collection);
  }

  /** Runs `step` just before every replace checks the version, as another writer would. */
  beforeReplace(step: () => void): void {
    this.#beforeReplace = step;
  }

  /** Makes the next call fail this way, before anything is read or written. */
  refuseNext(kind: RecordRefusalKind): void {
    this.#nextRefusal = kind;
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
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
    const workspace = String(args["workspace"]);
    if (!this.opened.includes(workspace)) {
      throw refusal("folder_not_open", `${workspace} is not an opened folder`);
    }
    const folder = this.#folder(workspace);
    switch (command) {
      case "record_append":
        return this.#append(folder, args["appends"] as { collection: string; lines: string }[]);
      case "record_read":
        return this.#read(folder, String(args["collection"]));
      case "record_replace":
        return this.#replace(folder, args);
      default:
        throw `Command ${command} not found`;
    }
  }

  #append(folder: Map<string, string>, appends: { collection: string; lines: string }[]): null {
    for (const { collection, lines } of appends) {
      checkLines(collection, lines);
    }
    for (const { collection, lines } of appends) {
      folder.set(collection, (folder.get(collection) ?? "") + lines);
    }
    return null;
  }

  async #read(folder: Map<string, string>, collection: string): Promise<unknown> {
    const lines = folder.get(collection) ?? "";
    return { lines, version: await version(lines), file: `/profile/records/${collection}.jsonl` };
  }

  async #replace(folder: Map<string, string>, args: Record<string, unknown>): Promise<unknown> {
    const collection = String(args["collection"]);
    const lines = String(args["lines"]);
    if (lines !== "") {
      checkLines(collection, lines);
    }
    this.#beforeReplace?.();
    if ((await version(folder.get(collection) ?? "")) !== args["version"]) {
      return { status: "changed" };
    }
    if (lines === "") {
      folder.delete(collection);
    } else {
      folder.set(collection, lines);
    }
    return { status: "replaced" };
  }

  #folder(workspace: string): Map<string, string> {
    let folder = this.#folders.get(workspace);
    if (folder === undefined) {
      folder = new Map();
      this.#folders.set(workspace, folder);
    }
    return folder;
  }
}

/** Refuses lines that aren't whole lines of JSON changes to `collection`, as the Rust shell does. */
function checkLines(collection: string, lines: string): void {
  const whole =
    lines.endsWith("\n") &&
    lines
      .slice(0, -1)
      .split("\n")
      .every((line) => isChangeTo(collection, line));
  if (!whole) {
    throw refusal("invalid_lines", `not whole lines of changes to ${collection}`);
  }
}

function isChangeTo(collection: string, line: string): boolean {
  try {
    return (JSON.parse(line) as { collection?: unknown } | null)?.collection === collection;
  } catch {
    return false;
  }
}

async function version(lines: string): Promise<string> {
  const bytes = new Uint8Array(encodeUtf8(lines));
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function refusal(kind: RecordRefusalKind, message: string): RecordRefusal {
  return { kind, message };
}
