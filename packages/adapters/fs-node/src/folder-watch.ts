import { type FSWatcher, watch as watchFolder } from "node:fs";
import type { WatchEvents } from "@halonicjs/adapter-watch-kit";

/**
 * Starts telling `noticed` the names (relative to `root`, with the system's
 * separator) of entries that may have changed, and gives a function that
 * stops it. The default is `node:fs.watch`, recursive; tests pass their own.
 */
export type FolderEvents = (
  root: string,
  noticed: (name: string) => void,
  failed: (error: Error) => void,
) => () => void;

/**
 * `node:fs.watch` on the whole folder. Node watches subfolders itself on
 * Linux, macOS and Windows. On Linux it takes one inotify watch per
 * subfolder, so a big workspace can use up the system's limit; that failure
 * comes with an explanation (see {@link explainWatchFailure}).
 */
export const nodeFolderEvents: FolderEvents = (root, noticed, failed) => {
  let watcher: FSWatcher;
  try {
    watcher = watchFolder(root, { recursive: true }, (_event, name) => {
      // Node may give no name when the system doesn't say which entry changed.
      noticed(name ?? "");
    });
  } catch (error) {
    throw explainWatchFailure(root, error);
  }
  // Node also reports the limit this way, when a subfolder added later can't be watched.
  watcher.on("error", (error) => failed(explainWatchFailure(root, error)));
  return () => watcher.close();
};

/**
 * The error to report when watching `root` failed. Linux answers `ENOSPC`
 * when every inotify watch the user may have is taken
 * (`fs.inotify.max_user_watches`); that message, "no space left on device",
 * would send people looking at their disk, so it is replaced with one that
 * names the limit. The system's error stays as the `cause`.
 */
export function explainWatchFailure(root: string, error: unknown): Error {
  if (errorCode(error) !== "ENOSPC") {
    return asError(error);
  }
  return new Error(
    `Can't watch ${root} for changes: the system's limit on watched folders is reached ` +
      "(fs.inotify.max_user_watches on Linux). Raise that limit, " +
      "or close other programs that watch many folders, then open the workspace again.",
    { cause: error },
  );
}

/**
 * The kit's event source for `root`: the names `events` gives, with `/`
 * between segments, as workspace paths have them, where Windows gives `\`.
 */
export function folderWatchEvents(root: string, events: FolderEvents): WatchEvents {
  return (noticed, failed) => events(root, (name) => noticed(name.split("\\").join("/")), failed);
}

/** The `code` of a Node system error, such as `ENOSPC`. */
function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
