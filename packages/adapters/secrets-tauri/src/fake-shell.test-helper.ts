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

/** Halonic's own secrets, in canonical form, which the `secret_*` commands refuse. */
const halonicNames = ["token_key", "serve_password"];

/** The canonical prefix the shell keeps every token under. */
const tokenPrefix = "halonic_token_";

/**
 * A shell that answers the `secret_*` and `token_*` commands as
 * `crates/secrets` does over its `MemoryBackend`, written out on its own
 * rather than from the adapter: names checked and stored lower case with `-`
 * as `_`, Halonic's own names refused to the secret commands, tokens kept
 * under the token prefix, values checked against the backend's limit,
 * refusals as `{ kind, message }`. Every call is kept in
 * `calls`, and `refuseNext` makes the next call fail the way a keychain can.
 */
export class FakeShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** What the keychain holds, by canonical name. */
  readonly entries = new Map<string, string>();
  readonly #maxValueBytes: number;
  readonly #granted: boolean;
  readonly #refusesHalonicNames: boolean;
  #nextRefusal: RefusalKind | undefined;

  /**
   * @param options.maxValueBytes - the backend's limit; the Windows Credential Manager holds less
   * @param options.granted - whether the page has the `desktop-secrets` capability; the served Studio doesn't
   * @param options.refusesHalonicNames - whether the secret commands refuse Halonic's own names, as
   *   the shell does. Only the shared contracts turn it off: their names include `serve-password`
   *   and `token-key`, and they check what the adapter does with any name, not the shell's refusal.
   */
  constructor(
    options: { maxValueBytes?: number; granted?: boolean; refusesHalonicNames?: boolean } = {},
  ) {
    this.#maxValueBytes = options.maxValueBytes ?? shellMaxValueBytes;
    this.#granted = options.granted ?? true;
    this.#refusesHalonicNames = options.refusesHalonicNames ?? true;
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
    const name = this.#storedName(command, args?.["name"]);
    switch (command) {
      case "secret_get":
      case "token_get":
        return this.entries.get(name) ?? null;
      case "secret_has":
        return this.entries.has(name);
      case "secret_set":
      case "token_set":
        this.entries.set(name, this.#checkedValue(args?.["value"]));
        return null;
      case "secret_delete":
      case "token_delete":
        this.entries.delete(name);
        return null;
      default:
        throw `Command ${command} not found`;
    }
  }

  /**
   * The name an entry is kept under: a token's under the token prefix, a secret's as it is, unless it
   * belongs to Halonic. Like `SecretName::token`, the shell also refuses a token name that is too
   * long once prefixed; the adapter never sends one, so the fake leaves that out.
   */
  #storedName(command: string, name: unknown): string {
    if (command.startsWith("token_")) {
      return tokenPrefix + canonicalName(name);
    }
    const canonical = canonicalName(name);
    if (
      this.#refusesHalonicNames &&
      (halonicNames.includes(canonical) || canonical.startsWith(tokenPrefix))
    ) {
      throw refusal("reserved_name", "this name belongs to Halonic");
    }
    return canonical;
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
