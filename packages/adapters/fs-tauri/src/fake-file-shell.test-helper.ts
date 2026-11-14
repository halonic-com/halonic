import { checkWorkspacePath, isPrivateWorkspacePath } from "@halonicjs/ports";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type {
  FileRefusal,
  FileRefusalKind,
  TauriChannelHandle,
  TauriFileShell,
} from "./file-commands.ts";

/** The digest the shell compares `expected` with: `sha256:` and the hex SHA-256 of the UTF-8 text. */
async function digestOf(text: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return `sha256:${[...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Whether the file (`undefined` for none) is what `expected` names: `"absent"`, `"not-text"` or a digest. */
async function holdsExpected(
  current: string | typeof notText | undefined,
  expected: string,
): Promise<boolean> {
  if (current === undefined) return expected === "absent";
  if (current === notText) return expected === "not-text";
  return (await digestOf(current)) === expected;
}

/** A file the shell holds that isn't UTF-8 text. */
export const notText = Symbol("not text");

/**
 * A shell that answers the `fs_*` commands as the Rust shell does, written
 * out on its own rather than from the adapter: files kept in memory by
 * workspace path for the folders the person opened, every path checked
 * again with the port's rules, nothing read, written or removed through a
 * link, and `expected` compared with the file before a write.
 *
 * A watch gets the paths `changeOutside` touches, as the shell's polling
 * would see them. A call with `folder: "review"` goes to {@link review}, the
 * workspace's review folder in the profile. Every call is kept in `calls`.
 */
export class FakeFileShell implements TauriFileShell {
  readonly calls: ShellCall[] = [];
  /** Files by workspace path, for the one workspace the tests open. */
  readonly files = new Map<string, string | typeof notText>();
  /** Workspace paths that are symbolic links: nothing at or under them is served. */
  readonly links = new Set<string>();
  /** Folders under the workspace the account may not read. */
  readonly unreadable = new Set<string>();
  readonly #opened: readonly string[];
  readonly #granted: boolean;
  readonly #channels = new Map<string, (message: unknown) => void>();
  readonly #watches = new Map<number, string>();
  #nextChannel = 0;
  #nextWatch = 0;
  #nextRefusal: { kind: FileRefusalKind; command: string | undefined } | undefined;
  #review: FakeFileShell | undefined;
  readonly #approvals = new Map<string, FakeFileShell>();

  /**
   * @param options.opened - the folders the person opened in the shell
   * @param options.files - the workspace's files to start with
   * @param options.granted - whether the page has the `desktop-files` capability; the served Studio doesn't
   */
  constructor(options: {
    opened: readonly string[];
    files?: Readonly<Record<string, string>>;
    granted?: boolean;
  }) {
    this.#opened = options.opened;
    this.#granted = options.granted ?? true;
    for (const [path, text] of Object.entries(options.files ?? {})) {
      this.files.set(path, text);
    }
  }

  /** The workspace's review folder in the profile, which calls with `folder: "review"` reach. */
  get review(): FakeFileShell {
    this.#review ??= new FakeFileShell({ opened: this.#opened, granted: this.#granted });
    return this.#review;
  }

  /** One source's tool approvals in `workspace`, which calls with `folder: "tool-approvals"` and that `source` reach. */
  approvalsOf(workspace: string, source: string): FakeFileShell {
    // As the shell names the folder: by the pair, never a joined spelling.
    const folder = JSON.stringify([workspace, source]);
    let approvals = this.#approvals.get(folder);
    if (approvals === undefined) {
      approvals = new FakeFileShell({ opened: this.#opened, granted: this.#granted });
      this.#approvals.set(folder, approvals);
    }
    return approvals;
  }

  /** How many watches are open in the shell. */
  get openWatches(): number {
    return this.#watches.size;
  }

  /** Makes the next call (to `command`, when given) fail this way, before anything is read or written. */
  refuseNext(kind: FileRefusalKind, command?: string): void {
    this.#nextRefusal = { kind, command };
  }

  /**
   * Changes files as another program would (a text writes, `null` removes),
   * then sends every open watch the paths it touched, as one batch.
   */
  changeOutside(changes: Readonly<Record<string, string | null>>): void {
    for (const [path, text] of Object.entries(changes)) {
      if (text === null) {
        this.files.delete(path);
      } else {
        this.files.set(path, text);
      }
    }
    this.send({ type: "changed", paths: Object.keys(changes) });
  }

  /** Sends every open watch `message`, as the shell's channel would. */
  send(message: unknown): void {
    for (const channel of this.#watches.values()) {
      const deliver = this.#channels.get(channel);
      // Tauri delivers a channel's messages later, never inside the call that sent them.
      queueMicrotask(() => deliver?.(structuredClone(message)));
    }
  }

  openChannel(onMessage: (message: unknown) => void): TauriChannelHandle {
    const argument = `__CHANNEL__:${this.#nextChannel++}`;
    this.#channels.set(argument, onMessage);
    return { argument, close: () => this.#channels.delete(argument) };
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (!this.#granted) {
      // What Tauri rejects with for a command the capability doesn't allow: text, not a refusal.
      throw `Command ${command} not allowed by ACL`;
    }
    const next = this.#nextRefusal;
    if (next !== undefined && (next.command === undefined || next.command === command)) {
      this.#nextRefusal = undefined;
      throw refusal(next.kind, `refused by the test (${next.kind})`);
    }
    if (command === "fs_unwatch") {
      this.#watches.delete(Number(args["watchId"]));
      return null;
    }
    if (!this.#opened.includes(String(args["workspace"]))) {
      throw refusal("folder_not_open", "the folder isn't open");
    }
    const { folder, ...rest } = args;
    if (folder === "review" && command !== "fs_watch") {
      return await this.review.invoke(command, rest);
    }
    if (folder === "tool-approvals" && command !== "fs_watch") {
      const { source, ...others } = rest;
      return await this.#approvalsCall(command, String(args["workspace"]), source, others);
    }
    if (folder !== undefined && folder !== "workspace") {
      // What Tauri rejects with for an argument the command can't take: text, not a refusal.
      throw `invalid args \`folder\` for command ${command}`;
    }
    switch (command) {
      case "fs_list":
        return this.#list(args["dir"] === null ? null : String(args["dir"]));
      case "fs_read":
        return this.#read(this.#checked(args["path"]));
      case "fs_write":
        return await this.#write(
          this.#checked(args["path"]),
          String(args["text"]),
          args["expected"] as string | null,
        );
      case "fs_remove":
        return await this.#remove(this.#checked(args["path"]), args["expected"]);
      case "fs_watch": {
        const watchId = this.#nextWatch++;
        this.#watches.set(watchId, String(args["channel"]));
        return { watchId };
      }
      default:
        throw `Command ${command} not found`;
    }
  }

  /** A call on the approvals folder: it needs a source, lists only the whole folder and keeps to the store's own file names. */
  async #approvalsCall(
    command: string,
    workspace: string,
    source: unknown,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const unsafe = (message: string) => refusal("unsafe_path", message);
    if (typeof source !== "string") throw unsafe("the tool approvals need a source");
    const { path, dir } = args;
    if (command === "fs_list" && dir !== null) throw unsafe("only the whole folder is listed");
    if (path !== undefined && !/^(?:[0-9a-f]{64}|waiting)\.json$/u.test(String(path))) {
      throw unsafe("the tool approvals folder holds only the store's own files");
    }
    return await this.approvalsOf(workspace, source).invoke(command, { workspace, ...args });
  }

  #list(dir: string | null): string[] {
    if (dir !== null) {
      this.#checked(dir);
    }
    const prefix = dir === null ? "" : `${dir}/`;
    const folder = [...this.unreadable].find((path) => `${path}/`.startsWith(prefix));
    if (folder !== undefined) {
      throw { ...refusal("folder_unreadable", "permission denied"), path: folder };
    }
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix) && !isPrivateWorkspacePath(path))
      .filter((path) => !this.#linked(path))
      .sort();
  }

  #read(path: string): string | null {
    const text = this.files.get(path);
    if (text === notText) {
      throw refusal("not_text", `${path} isn't UTF-8 text`);
    }
    return text ?? null;
  }

  async #write(
    path: string,
    text: string,
    expected: string | null,
  ): Promise<{ status: "written" } | { status: "changed-on-disk"; current: string | null }> {
    if (expected !== null) {
      const current = this.#read(path);
      const holds =
        current === null ? expected === "absent" : (await digestOf(current)) === expected;
      if (!holds) {
        return { status: "changed-on-disk", current };
      }
    }
    this.files.set(path, text);
    return { status: "written" };
  }

  async #remove(path: string, expected: unknown): Promise<unknown> {
    const current = this.files.get(path);
    if (typeof expected === "string" && !(await holdsExpected(current, expected))) {
      return { status: "changed-on-disk", current: typeof current === "string" ? current : null };
    }
    this.files.delete(path);
    return { status: "removed" };
  }

  /** The path, refused as the shell refuses it: unsafe, private, or through a link. */
  #checked(path: unknown): string {
    const text = String(path);
    try {
      checkWorkspacePath(text);
    } catch {
      throw refusal("unsafe_path", `${JSON.stringify(text)} is unsafe`);
    }
    if (isPrivateWorkspacePath(text) || this.#linked(text)) {
      throw refusal("private_path", `${JSON.stringify(text)} is private`);
    }
    return text;
  }

  #linked(path: string): boolean {
    return [...this.links].some((link) => path === link || path.startsWith(`${link}/`));
  }
}

function refusal(kind: FileRefusalKind, message: string): FileRefusal {
  return { kind, message };
}
