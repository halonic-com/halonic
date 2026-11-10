import type { TrustRecord } from "@halonicjs/ports";
import type { TauriShell, TrustRefusal, TrustRefusalKind } from "./shell.ts";

/** One command the page sent. */
export interface ShellCall {
  readonly command: string;
  readonly args: Record<string, unknown> | undefined;
}

/**
 * A shell that answers the `trust_*` commands as the Rust shell does, written
 * out on its own rather than from the adapter: records kept as JSON text by
 * location, a damaged record refused as `unreadable` naming its location, and
 * a grant saved only for a folder the person chose. A folder inside one they
 * picked in the dialog is saved at once; any other makes the shell ask, and
 * `answers` says what the person says. A folder a grant opened doesn't count
 * as picked, so a folder inside it is asked about again. A revoke closes the
 * folder it revokes.
 *
 * Every call is kept in `calls`, every question in `asked`, and every folder
 * git and the file commands may use in `opened`.
 */
export class FakeTrustShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** The folders the shell asked the person about, in order. */
  readonly asked: string[] = [];
  /** The folders the person picked in the folder dialog; only these spare a question. */
  readonly picked: readonly string[];
  /** The folders git and the file commands may use: picked ones, then granted ones. */
  readonly opened: string[];
  /** What the person says when the shell asks; `true` when the list runs out. */
  readonly answers: boolean[] = [];
  readonly #files = new Map<string, string>();
  readonly #granted: boolean;
  #nextRefusal: TrustRefusalKind | undefined;

  /**
   * @param options.picked - folders the person already chose in the folder dialog
   * @param options.granted - whether the page has the `desktop-trust` capability; the served Studio doesn't
   */
  constructor(options: { picked?: readonly string[]; granted?: boolean } = {}) {
    this.picked = [...(options.picked ?? [])];
    this.opened = [...this.picked];
    this.#granted = options.granted ?? true;
  }

  /** Makes the stored record for `location` unreadable, as a cut-off file is. */
  damage(location: string): void {
    const text = this.#files.get(location);
    if (text === undefined) {
      throw new Error(`There is no record for ${location} to damage.`);
    }
    this.#files.set(location, text.slice(0, text.length / 2));
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
      case "trust_get":
        return this.#read(String(args?.["location"]));
      case "trust_list":
        return [...this.#files.keys()]
          .sort((left, right) => (left < right ? -1 : 1))
          .map((location) => this.#read(location));
      case "trust_grant":
        return this.#grant(args?.["record"] as TrustRecord);
      case "trust_revoke":
        return this.#revoke(String(args?.["location"]));
      default:
        throw `Command ${command} not found`;
    }
  }

  #read(location: string): unknown {
    const text = this.#files.get(location);
    if (text === undefined) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw { ...refusal("unreadable", "the record file is damaged"), location };
    }
  }

  #grant(record: TrustRecord): null {
    const { location } = record;
    // By path part, as the shell compares canonical paths: `/acme-evil` isn't inside `/acme`.
    const chosen = this.picked.some(
      (folder) => location === folder || location.startsWith(`${folder}/`),
    );
    if (!chosen) {
      this.asked.push(location);
      if (!(this.answers.shift() ?? true)) {
        throw refusal("declined", "the person said no");
      }
    }
    this.#files.set(location, JSON.stringify(record));
    if (!this.opened.includes(location)) {
      this.opened.push(location);
    }
    return null;
  }

  #revoke(location: string): null {
    this.#files.delete(location);
    const index = this.opened.indexOf(location);
    if (index !== -1) {
      this.opened.splice(index, 1);
    }
    return null;
  }
}

function refusal(kind: TrustRefusalKind, message: string): TrustRefusal {
  return { kind, message };
}
