import { DigestWatch, runOwnChange } from "@halonicjs/adapter-watch-kit";
import {
  checkPublicWorkspacePath,
  type DefinitionStore,
  type DefinitionWatch,
  type DefinitionWatchListener,
  type ExpectedContent,
  type WriteOptions,
  type WriteResult,
} from "@halonicjs/ports";
import {
  assertDefined,
  bytesToHex,
  KeyedQueue,
  matchesExpected,
  type Sha256,
} from "@halonicjs/std";
import { browserPageReturns, FileStamps, focusEvents, type PageReturns } from "./focus-events.ts";
import { accessFailure, checkAccess, isDomError, readWrite } from "./folder-access.ts";
import { fileAt, filesUnder, folderAt, isScratch, splitPath } from "./folder-tree.ts";
import type { FileHandle, FolderHandle } from "./handles.ts";

/** The browser's Web Crypto API, as the digest the port's `expected` uses. */
const webCryptoDigest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/**
 * How long a watch waits after the person comes back before it reads what
 * moved. One check names every moved file at once, so this only joins
 * `focus` and `visibilitychange` firing together.
 */
const defaultQuietMs = 50;

/** Options for a {@link BrowserFolderDefinitionStore}; tests change them. */
export interface BrowserFolderStoreOptions {
  /** When a watch looks for outside changes: the page getting focus again or becoming visible, by default. */
  readonly pageReturns?: PageReturns;
  /** How long a watch waits after the person comes back before it reads what moved. */
  readonly quietMs?: number;
}

/**
 * Workspace files in a folder the person opened in the browser, through the
 * File System Access API (Chromium browsers only; see `openLocalFolder`).
 * Paths are checked like every other store's (see the port). The browser
 * API has no links, so the port's rule on links holds by itself.
 *
 * A write goes to the browser's pending copy of the file and lands in one
 * step when it closes, so another program reads the old text or the new,
 * never half of it. Writes to one path run one after another inside the
 * page, so the check for `expected` and its write are never split by
 * another write from this store. The browser has no file lock, so a program
 * outside it can still change the file while the write is pending. The
 * store checks `expected` again right before the close: a change found then
 * is not written over, the write gives `changed-on-disk`, and the watch
 * reports the change. Only a change in the moment between that last check
 * and the close is lost.
 *
 * Every call first checks the page may still use the folder, without asking
 * the person, and throws a `FolderAccessError` when it may not.
 */
export class BrowserFolderDefinitionStore implements DefinitionStore {
  /** `browser:` and the folder's name, as the browser gives no more of where it is. */
  readonly location: string;
  readonly #root: FolderHandle;
  readonly #writes = new KeyedQueue();
  readonly #watches = new Set<DigestWatch>();
  readonly #pageReturns: PageReturns;
  readonly #quietMs: number;

  /**
   * @param root - the folder the person picked
   * @param options - when a watch looks for outside changes
   */
  constructor(root: FolderHandle, options: BrowserFolderStoreOptions = {}) {
    this.#root = root;
    this.location = `browser:${root.name}`;
    this.#pageReturns = options.pageReturns ?? browserPageReturns;
    this.#quietMs = options.quietMs ?? defaultQuietMs;
  }

  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      checkPublicWorkspacePath(dir);
    }
    const prefix = dir ?? "";
    return await this.#withAccess(async () => {
      const folder = await folderAt(this.#root, prefix);
      if (folder === null) {
        return [];
      }
      return (await filesUnder(folder, prefix)).map((file) => file.path).sort();
    });
  }

  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    return await this.#withAccess(() => this.#readFile(path));
  }

  async write(path: string, content: string, options: WriteOptions = {}): Promise<WriteResult> {
    checkPublicWorkspacePath(path);
    return await this.#writes.run(path, () =>
      this.#withAccess(async () => {
        const { expected } = options;
        if (expected !== undefined) {
          const current = await this.#readFile(path);
          if (!(await matchesExpected(current, expected, webCryptoDigest))) {
            return { status: "changed-on-disk", current };
          }
        }
        // The watches are told before the write closes, so none reports it.
        const written = await runOwnChange(this.#watches, path, content, webCryptoDigest, () =>
          this.#replace(path, content, expected),
        );
        if (!written) {
          return { status: "changed-on-disk", current: await this.#readFile(path) };
        }
        return { status: "written" };
      }),
    );
  }

  async remove(path: string): Promise<void> {
    checkPublicWorkspacePath(path);
    await this.#writes.run(path, () =>
      this.#withAccess(async () => {
        if ((await fileAt(this.#root, path)) === null) {
          return;
        }
        await runOwnChange(this.#watches, path, null, webCryptoDigest, async () => {
          await this.#delete(path);
          return true;
        });
      }),
    );
  }

  /**
   * Reports changes from outside Halonic, as the port says. The browser has
   * no file events, so the watch looks each time the person comes back to
   * the page. It compares when each file last changed and its size with what
   * it saw before, and reads only the files where one differs.
   */
  async watch(listener: DefinitionWatchListener): Promise<DefinitionWatch> {
    // The stamps come first: a file that changes while the watch reads the
    // workspace has a new stamp at the next check, so it is looked at again.
    const stamps = await this.#withAccess(() => FileStamps.take(this.#root));
    return await DigestWatch.open(
      {
        files: this,
        digest: webCryptoDigest,
        events: focusEvents(stamps, this.#pageReturns),
        quietMs: this.#quietMs,
        isScratch,
        openWatches: this.#watches,
      },
      listener,
    );
  }

  /**
   * `sha256:` and the first 16 hex characters of a hash over every file it
   * serves and its text, worked out as the memory adapter does, so the same
   * files give the same version in both.
   */
  async version(): Promise<string> {
    const parts: string[] = [];
    for (const path of await this.list()) {
      const content = await this.read(path);
      if (content !== null) {
        parts.push(`${path}\n${content}`);
      }
    }
    const digest = await webCryptoDigest.sha256(new TextEncoder().encode(parts.join("\n\0")));
    return `sha256:${bytesToHex(digest).slice(0, 16)}`;
  }

  /**
   * Asks the person to let the page use the folder again, after a call threw
   * a `FolderAccessError` whose `state` is `prompt`. The browser shows its
   * prompt only from a click or a key press, so call this from one. Gives
   * whether access is back.
   */
  async requestAccess(): Promise<boolean> {
    const state = (await this.#root.requestPermission?.(readWrite)) ?? "granted";
    return state === "granted";
  }

  /** The text at a checked path, or `null` when there is no file or a folder is there. */
  async #readFile(path: string): Promise<string | null> {
    const handle = await fileAt(this.#root, path);
    if (handle === null) {
      return null;
    }
    try {
      return await (await handle.getFile()).text();
    } catch (error) {
      // Removed by another program between finding it and reading it.
      if (isDomError(error, "NotFoundError")) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Writes `content` to the browser's pending copy of the file at `path`,
   * which lands on close. Right before the close, it checks the file still
   * holds what is `expected`, so a change from outside since the first
   * check is not written over: it then drops the pending copy and gives
   * `false`. Only a change in the moment between that check and the close
   * is still lost.
   *
   * The browser makes a new file, empty, as soon as it is opened. When the
   * write then fails, that empty file is removed again, so a later scan
   * doesn't take it for a real file. It runs inside the store's own change,
   * so no watch reports the removal. A file that was there before is left as
   * it was.
   */
  async #replace(path: string, content: string, expected?: ExpectedContent): Promise<boolean> {
    const { folder, name } = splitPath(path);
    // With `create`, the folders are made on the way, or a file in the way throws.
    const parent = assertDefined(await folderAt(this.#root, folder, true), "the file's folder");
    const existed = (await fileAt(this.#root, path)) !== null;
    // A folder at `path` throws the browser's `TypeMismatchError`.
    const file = await parent.getFileHandle(name, { create: true });
    try {
      return await this.#writeThrough(file, path, content, expected);
    } catch (error) {
      if (!existed) {
        await this.#delete(path);
      }
      throw error;
    }
  }

  /** Writes `content` to a pending copy of `file` and closes it, unless the file no longer holds what is `expected`. */
  async #writeThrough(
    file: FileHandle,
    path: string,
    content: string,
    expected: ExpectedContent | undefined,
  ): Promise<boolean> {
    const pending = await file.createWritable();
    try {
      await pending.write(content);
      if (!(await this.#stillHolds(path, expected))) {
        await pending.abort();
        return false;
      }
    } catch (error) {
      await pending.abort();
      throw error;
    }
    await pending.close();
    return true;
  }

  /** Whether the file at `path` still holds what is `expected`, while the store's write to it is pending. */
  async #stillHolds(path: string, expected: ExpectedContent | undefined): Promise<boolean> {
    if (expected === undefined) {
      return true;
    }
    const current = await this.#readFile(path);
    // Opening a new file for writing makes it, empty, before the text lands.
    const before = expected === "absent" && current === "" ? null : current;
    return await matchesExpected(before, expected, webCryptoDigest);
  }

  async #delete(path: string): Promise<void> {
    const { folder, name } = splitPath(path);
    try {
      await (await folderAt(this.#root, folder))?.removeEntry(name);
    } catch (error) {
      // Another program removed it in the meantime: not an error.
      if (!isDomError(error, "NotFoundError")) {
        throw error;
      }
    }
  }

  /**
   * Runs `work` once the page may still use the folder, and turns the
   * browser's refusal into a `FolderAccessError`.
   */
  async #withAccess<T>(work: () => Promise<T>): Promise<T> {
    await checkAccess(this.#root);
    try {
      return await work();
    } catch (error) {
      throw accessFailure(error);
    }
  }
}
