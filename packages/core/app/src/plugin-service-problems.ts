// The problems `PluginService` gives for a plugin it can't load or add, in
// the words Studio and the CLI show: an entry that isn't a folder, a name
// some system would open as another entry, and a failed read.

import { checkPluginFiles, type FolderEntry } from "@halonicjs/ports";
import type { PluginProblem } from "./plugin-folder.ts";

/** A link or special file where a plugin folder should be, with the codes `readPluginFolder` uses inside one. */
export function notAFolderProblem(entry: FolderEntry): PluginProblem {
  if (entry.kind === "link") {
    return {
      code: "link",
      file: "",
      path: [],
      message: `${entry.path} is a link, not a folder. Each plugin is a folder of its own, so a link can't point Halonic at files it didn't check.`,
    };
  }
  return {
    code: "special-file",
    file: "",
    path: [],
    message: `${entry.path} is a special file, such as a pipe or a socket. Each plugin is a folder of its own.`,
  };
}

/**
 * A problem when the id or a file's name is one some system would open as
 * another entry, such as `con` or `notes.`, or two names are the same file
 * on a disk that ignores case, so the plugin can't be placed as it was
 * checked; `null` when every name is safe.
 */
export function unsafeNameProblem(
  id: string,
  files: ReadonlyMap<string, Uint8Array>,
): PluginProblem | null {
  try {
    checkPluginFiles(id, files);
    return null;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      code: "unsafe-name",
      file: "",
      path: [],
      message: `${error.message} Rename it in the plugin's source and add it again.`,
    };
  }
}

/** What the reader, the digest or the trust check threw, for this one plugin. */
export function readFailedProblem(error: unknown): PluginProblem {
  // A reason that ends a sentence already isn't given a second full stop.
  const reason = (error instanceof Error ? error.message : String(error)).replace(/\.$/u, "");
  return {
    code: "read-failed",
    file: "",
    path: [],
    message: `Halonic couldn't read the plugin: ${reason}. Load it again; if it keeps failing, remove the plugin and install it again.`,
  };
}
