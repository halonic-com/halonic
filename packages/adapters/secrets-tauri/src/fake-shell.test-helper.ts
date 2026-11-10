import type { RefusalKind, ShellRefusal, TauriShell } from "./shell.ts";

/** The most bytes a value may have in the shell (`MAX_VALUE_BYTES`, 16 KiB). */
export const shellMaxValueBytes = 16 * 1024;

/** The most bytes the Windows Credential Manager holds. */
export const windowsMaxValueBytes = 1280;

/** One command the page sent. */
export interface ShellCall {
  readonly command: string;
  readonly args: Record<string, unknown> | undefined;
}

/**
 * A shell that answers the `secret_*` commands as `crates/secrets` does over
 * its `MemoryBackend`, written out on its own rather than from the adapter:
 * names checked and stored lower case with `-` as `_`, values checked against
 * the backend's limit, refusals as `{ kind, message }`. Every call is kept in
 * `calls`, and `refuseNext` makes the next call fail the way a keychain can.
 */
export class FakeShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** What the keychain holds, by canonical name. */
  readonly entries = new Map<string, string>();
  readonly #maxValueBytes: number;
  readonly #granted: boolean;
  #nextRefusal: RefusalKind | undefined;

  /**
   * @param options.maxValueBytes - the backend's limit; the Windows Credential Manager holds less
   * @param options.granted - whether the page has the `desktop-secrets` capability; the served Studio doesn't
   */
  constructor(options: { maxValueBytes?: number; granted?: boolean } = {}) {
    this.#maxValueBytes = options.maxValueBytes ?? shellMaxValueBytes;
    this.#granted = options.granted ?? true;
  }

  /** Makes the next call reject with this kind, before the keychain is touched. */
  refuseNext(kind: RefusalKind): void {
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
    const name = canonicalName(args?.["name"]);
    switch (command) {
      case "secret_get":
        return this.entries.get(name) ?? null;
      case "secret_set":
        this.entries.set(name, this.#checkedValue(args?.["value"]));
        return null;
      case "secret_delete":
        this.entries.delete(name);
        return null;
      default:
        throw `Command ${command} not found`;
    }
  }

  #checkedValue(value: unknown): string {
    if (
      typeof value !== "string" ||
      value === "" ||
      new TextEncoder().encode(value).length > this.#maxValueBytes
    ) {
      throw refusal(
        "invalid_value",
        "a secret's value must not be empty or longer than this keychain holds",
      );
    }
    return value;
  }
}

function refusal(kind: RefusalKind, message: string): ShellRefusal {
  return { kind, message };
}

/** `SecretName::parse`: the port's rule, then lower case with `-` as `_`. */
function canonicalName(name: unknown): string {
  if (typeof name !== "string" || name.length > 128 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    throw refusal("invalid_name", "not a secret name");
  }
  return name.toLowerCase().replaceAll("-", "_");
}
