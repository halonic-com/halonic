// Where the tools may read (HAL-16748). The read tools are allowed without
// asking, like Claude Code's own `Read`, so they refuse every file `Read`
// would have to ask about: anything outside the agent's working folder.
// The one exception is the folder `run_tests` writes its logs to, so the
// model can read more of a long test log.

import { realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { isInsideOrSame } from "@halonicjs/adapter-harness-kit";
import { ToolRefusal } from "./tool-input.ts";

/** The folders the tools work in, each as its real path. */
export interface ToolFolders {
  /** The agent's working folder: every path a tool takes is read from here, and must stay in it. */
  readonly workingFolder: string;
  /** The folder `run_tests` writes its logs to; only `read_ranges` may also read in it. */
  readonly testLogFolder: string;
}

/** Where a path may lead: the working folder only, or also the test log folder. */
export type PathScope = "working-folder" | "working-folder-or-test-logs";

/** A path a tool may use: where it really is, and how to name it to the model. */
export interface AllowedPath {
  /** The real path, with every link resolved. */
  readonly real: string;
  /** The path relative to the working folder with `/`, or the real path for a test log. */
  readonly shown: string;
}

/**
 * Where `path`, as the model wrote it, really is, when it may be read
 * (requirement `coding-tools.paths`). It is read from the working folder,
 * and both the path as written and the place its links lead to must be in
 * the working folder (or, for `working-folder-or-test-logs`, in the test
 * log folder). So `..`, an absolute path, a Windows drive or `\\server`
 * path, and a link out are all refused. The sandbox's fence still applies
 * underneath: a hard link to a denied file is the fence's to refuse.
 *
 * @throws {ToolRefusal} when the path leads outside, or isn't there
 */
export async function allowedPath(
  path: string,
  folders: ToolFolders,
  scope: PathScope,
): Promise<AllowedPath> {
  const written = resolve(folders.workingFolder, path);
  if (!isAllowed(written, folders, scope)) throw outside(path, scope);
  let real: string;
  try {
    real = await realpath(written);
  } catch {
    throw new ToolRefusal(`'${path}' isn't there.`);
  }
  if (!isAllowed(real, folders, scope)) throw outside(path, scope);
  return { real, shown: shownPath(real, folders) };
}

/**
 * {@link allowedPath} for a file to read: it must also be a plain file, so
 * a named pipe or a device can't make the tool wait forever.
 *
 * @throws {ToolRefusal} as `allowedPath` does, or when it is a folder or anything but a file
 */
export async function allowedFile(
  path: string,
  folders: ToolFolders,
  scope: PathScope,
): Promise<AllowedPath & { readonly size: number }> {
  const allowed = await allowedPath(path, folders, scope);
  const info = await stat(allowed.real);
  if (info.isDirectory()) throw new ToolRefusal(`'${allowed.shown}' is a folder, not a file.`);
  if (!info.isFile()) throw new ToolRefusal(`'${allowed.shown}' isn't a plain file.`);
  return { ...allowed, size: info.size };
}

/** How a real path in the working folder is named to the model: relative, with `/`. */
export function shownPath(real: string, folders: ToolFolders): string {
  if (!isInsideOrSame(real, folders.workingFolder)) return real;
  const way = relative(folders.workingFolder, real);
  return way === "" ? "." : way.split(sep).join("/");
}

function isAllowed(path: string, folders: ToolFolders, scope: PathScope): boolean {
  if (isInsideOrSame(path, folders.workingFolder)) return true;
  return scope === "working-folder-or-test-logs" && isInsideOrSame(path, folders.testLogFolder);
}

function outside(path: string, scope: PathScope): ToolRefusal {
  const where =
    scope === "working-folder"
      ? "the working folder"
      : "the working folder or the run_tests log folder";
  return new ToolRefusal(
    `'${path}' is outside ${where}. This tool reads only there; give a path relative to the working folder.`,
  );
}
