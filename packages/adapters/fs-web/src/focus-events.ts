import type { WatchEvents } from "@halonicjs/adapter-watch-kit";
import { accessFailure, checkAccess, isDomError } from "./folder-access.ts";
import { filesUnder } from "./folder-tree.ts";
import type { FolderHandle } from "./handles.ts";

/**
 * Calls `returned` each time the person comes back to the page, and gives a
 * function that stops it. The browser has no file events, so this is when a
 * store looks for changes made in another program meanwhile.
 */
export type PageReturns = (returned: () => void) => () => void;

/** The page gets focus again or becomes visible: `focus` on the window, `visibilitychange` on the document. */
export const browserPageReturns: PageReturns = (returned) => {
  const whenVisible = (): void => {
    if (document.visibilityState === "visible") {
      returned();
    }
  };
  window.addEventListener("focus", returned);
  document.addEventListener("visibilitychange", whenVisible);
  return () => {
    window.removeEventListener("focus", returned);
    document.removeEventListener("visibilitychange", whenVisible);
  };
};

/**
 * When each file under the opened folder last changed and how long it was,
 * as last seen. Comparing these is cheap: the browser knows them without
 * reading the file, so a check reads and hashes only the files whose stamp
 * moved, not the whole folder.
 */
export class FileStamps {
  readonly #root: FolderHandle;
  #stamps: ReadonlyMap<string, string>;

  private constructor(root: FolderHandle, stamps: ReadonlyMap<string, string>) {
    this.#root = root;
    this.#stamps = stamps;
  }

  /** Takes the stamp of every file under `root`. */
  static async take(root: FolderHandle): Promise<FileStamps> {
    return new FileStamps(root, await stampsUnder(root));
  }

  /**
   * The paths of files that are new, gone, or whose stamp moved since last
   * seen, and remembers the stamps as they are now.
   *
   * @throws FolderAccessError when the page may no longer use the folder
   */
  async moved(): Promise<string[]> {
    const before = this.#stamps;
    const now = await stampsUnder(this.#root);
    this.#stamps = now;
    const moved = [...now].filter(([path, stamp]) => before.get(path) !== stamp);
    const gone = [...before.keys()].filter((path) => !now.has(path));
    return [...moved.map(([path]) => path), ...gone];
  }
}

/**
 * The {@link WatchEvents} of a folder in the browser: each time the person
 * comes back to the page, the paths whose stamp moved. One check runs at a
 * time; `focus` and `visibilitychange` firing together make one more check
 * at most.
 */
export function focusEvents(stamps: FileStamps, pageReturns: PageReturns): WatchEvents {
  return (noticed, failed) => {
    let stopped = false;
    let waiting = false;
    let checking = Promise.resolve();
    const check = (): void => {
      if (waiting) {
        return;
      }
      waiting = true;
      checking = checking
        .then(async () => {
          waiting = false;
          const paths = stopped ? [] : await stamps.moved();
          for (const path of paths) {
            noticed(path);
          }
        })
        .catch((error: unknown) => {
          failed(asError(accessFailure(error)));
        });
    };
    const stopReturns = pageReturns(check);
    return () => {
      stopped = true;
      stopReturns();
    };
  };
}

/** The stamp of every file under `root`, by workspace path; a file gone while it is read is left out. */
async function stampsUnder(root: FolderHandle): Promise<Map<string, string>> {
  await checkAccess(root);
  const stamps = new Map<string, string>();
  for (const { path, handle } of await filesUnder(root, "")) {
    try {
      const file = await handle.getFile();
      stamps.set(path, `${file.lastModified}:${file.size}`);
    } catch (error) {
      if (!isDomError(error, "NotFoundError")) {
        throw error;
      }
    }
  }
  return stamps;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
