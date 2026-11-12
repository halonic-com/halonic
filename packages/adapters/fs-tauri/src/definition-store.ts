import { type DigestWatch, runOwnChange } from "@halonicjs/adapter-watch-kit";
import {
  checkPublicWorkspacePath,
  type DefinitionStore,
  type DefinitionWatch,
  type DefinitionWatchListener,
  type Digest,
  UnreadableWorkspaceFolderError,
  type WriteOptions,
  type WriteResult,
} from "@halonicjs/ports";
import { bytesToHex, type ErrorKind, KeyedQueue, KindedError } from "@halonicjs/std";
import {
  type FileRefusalKind,
  fileCommands,
  isFileRefusal,
  type TauriFileFolder,
  type TauriFileShell,
} from "./file-commands.ts";
import { ShellWatch, type WatchId } from "./shell-watch.ts";

/** The Web Crypto API the page has, as the {@link Digest} port. */
const webCryptoDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/**
 * Workspace files for the Studio desktop app: every call goes to one of the
 * shell's `fs_*` commands, on the plain files of a folder the person opened
 * in the shell, the same files the CLI's `FolderDefinitionStore` reads and
 * writes.
 *
 * The page names the workspace, never a path outside it. Paths are checked
 * here as the port says, before the shell is called, and the shell checks
 * them again, since the page isn't trusted. A write with `expected` is
 * compared and renamed into place in the shell, under a lock it holds for
 * each file, so nothing can come between the check and the write.
 *
 * `watch()` hears the shell's `fs_watch`, which says which files may have
 * changed; the store reads them and reports only those whose text differs,
 * leaving out its own writes and removes.
 *
 * With `folder: "review"` the store keeps the workspace's review records
 * instead, in its folder in the profile, as `openWorkspace` asks for
 * `reviewRecords`. Nothing outside Halonic edits them, so that store's watch
 * reports nothing, as the port says of a store that sees no outside change.
 *
 * @example
 * const store = new TauriDefinitionStore(shell, workspace);
 * const reviewRecords = new TauriDefinitionStore(shell, workspace, { folder: "review" });
 */
export class TauriDefinitionStore implements DefinitionStore {
  /** The workspace folder, as the person opened it in the shell. */
  readonly location: string;
  readonly #shell: TauriFileShell;
  readonly #folder: TauriFileFolder;
  readonly #writes = new KeyedQueue();
  readonly #watches = new Set<DigestWatch>();

  /**
   * @param shell - the shell's IPC with a way to open channels, built from `window.__TAURI_INTERNALS__`
   * @param workspace - the workspace folder, as the person opened it in the shell
   * @param options.folder - which of the workspace's folders the store keeps: `"workspace"` (the default) or `"review"`
   */
  constructor(
    shell: TauriFileShell,
    workspace: string,
    options: { readonly folder?: TauriFileFolder } = {},
  ) {
    this.#shell = shell;
    this.location = workspace;
    this.#folder = options.folder ?? "workspace";
  }

  /** @throws UnreadableWorkspaceFolderError naming a folder under the workspace the shell can't read */
  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      checkPublicWorkspacePath(dir);
    }
    const answer = await this.#call(fileCommands.list, { dir: dir ?? null });
    if (!Array.isArray(answer) || !answer.every((path) => typeof path === "string")) {
      throw noAnswer();
    }
    return answer;
  }

  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    const answer = await this.#call(fileCommands.read, { path });
    if (answer !== null && typeof answer !== "string") {
      throw noAnswer();
    }
    return answer;
  }

  async write(path: string, content: string, options: WriteOptions = {}): Promise<WriteResult> {
    checkPublicWorkspacePath(path);
    // One write to a path at a time, so the watches know which of their own changes is on disk.
    return await this.#writes.run(path, async () => {
      let result: WriteResult = { status: "written" };
      // A write the shell refused as changed on disk left the file alone: the watches still report that change.
      await runOwnChange(this.#watches, path, content, webCryptoDigest, async () => {
        const answer = await this.#call(fileCommands.write, {
          path,
          text: content,
          expected: options.expected ?? null,
        });
        result = checkedWrite(answer);
        return result.status === "written";
      });
      return result;
    });
  }

  async remove(path: string): Promise<void> {
    checkPublicWorkspacePath(path);
    await this.#writes.run(path, async () => {
      await runOwnChange(this.#watches, path, null, webCryptoDigest, async () => {
        await this.#call(fileCommands.remove, { path });
        return true;
      });
    });
  }

  /**
   * `sha256:` and the first 16 hex characters of a hash over every file it
   * serves and its text, worked out as `fs-node` and the memory adapter do,
   * so the same files give the same version in all three.
   */
  async version(): Promise<string> {
    const parts: string[] = [];
    for (const path of await this.list()) {
      const content = await this.read(path);
      if (content !== null) {
        parts.push(`${path}\n${content}`);
      }
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(parts.join("\n\0")),
    );
    return `sha256:${bytesToHex(new Uint8Array(digest)).slice(0, 16)}`;
  }

  /**
   * Reports changes from outside Halonic, as the port says, from the shell's `fs_watch`. The
   * review records' watch reports nothing: only Halonic edits them.
   */
  async watch(listener: DefinitionWatchListener): Promise<DefinitionWatch> {
    if (this.#folder !== "workspace") {
      return { close: async () => {} };
    }
    // The watch is in `#watches` from before it first reads the workspace until it closes or fails.
    return await ShellWatch.open(
      {
        files: this,
        digest: webCryptoDigest,
        openWatches: this.#watches,
        events: {
          openChannel: (onMessage) => this.#shell.openChannel(onMessage),
          start: async (channel) =>
            checkedWatchId(await this.#call(fileCommands.watch, { channel: channel.argument })),
          stop: async (watchId) => {
            await this.#shell.invoke(fileCommands.unwatch, { watchId });
          },
        },
      },
      listener,
    );
  }

  /** Runs one command on this store's folder, turning a refusal into the error the port asks for. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    // The workspace's own files name no folder, as the shell's commands did before `folder` came.
    const folder = this.#folder === "workspace" ? {} : { folder: this.#folder };
    try {
      return await this.#shell.invoke(command, { workspace: this.location, ...folder, ...args });
    } catch (reason) {
      throw fileFailure(reason);
    }
  }
}

/** How a surface should respond to each refusal that isn't a path the port refuses or an unreadable folder. */
const errorKinds: Readonly<
  Record<Exclude<FileRefusalKind, "unsafe_path" | "private_path" | "folder_unreadable">, ErrorKind>
> = {
  folder_not_open: "denied",
  // A file someone else put there that the Studio can't edit as text.
  not_text: "invalid_input",
  io: "unavailable",
};

/**
 * The error a rejected `fs_*` command becomes. A path the shell refuses is a
 * `RangeError`, as the port asks: the page checks the same rules first, so
 * this is a link in the path, which only the shell can see. An unreadable
 * folder is an {@link UnreadableWorkspaceFolderError} naming it. Anything
 * that isn't the shell's refusal shape (a missing capability, a broken IPC
 * call) is `unavailable`, and its text is dropped: the adapter can't vouch
 * for it.
 */
function fileFailure(reason: unknown): Error {
  if (!isFileRefusal(reason)) {
    return noAnswer();
  }
  switch (reason.kind) {
    case "unsafe_path":
    case "private_path":
      return new RangeError(`The workspace path is refused: ${reason.message}`, { cause: reason });
    case "folder_unreadable": {
      // The shell always names the folder; without a name, it is the workspace itself.
      const folder = reason.path ?? "";
      return new UnreadableWorkspaceFolderError(
        folder,
        `The workspace folder ${folder} can't be read.`,
        { cause: reason },
      );
    }
    default:
      return new KindedError(
        errorKinds[reason.kind],
        `The workspace files refused the call: ${reason.message}`,
      );
  }
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the file call.");
}

/** The shell's answer to a write, checked as far as the adapter relies on it. */
function checkedWrite(answer: unknown): WriteResult {
  const { status, current } = (answer ?? {}) as Record<string, unknown>;
  if (status === "written") {
    return { status };
  }
  if (status === "changed-on-disk" && (current === null || typeof current === "string")) {
    return { status, current };
  }
  throw noAnswer();
}

function checkedWatchId(answer: unknown): WatchId {
  const { watchId } = (answer ?? {}) as Record<string, unknown>;
  if (!Number.isSafeInteger(watchId)) {
    throw noAnswer();
  }
  return watchId as WatchId;
}
