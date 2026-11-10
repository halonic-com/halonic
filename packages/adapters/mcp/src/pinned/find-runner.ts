import { posix, win32 } from "node:path";
import type { ConnectorPin } from "@halonicjs/ports";
import { type FolderSources, programFolders, uniqueFolders } from "./program-folders.ts";

/** What the launcher may look at to find a runner, all from the app's own environment. */
export interface RunnerSearch extends FolderSources {
  /** On Windows, `%PATHEXT%`: the endings a bare program name may have, in order. */
  readonly pathExt?: string | undefined;
  /** Whether a file is there that this computer may run. */
  readonly isProgram: (path: string) => Promise<boolean>;
  /** Whether a file is there at all, such as npm's own `npx-cli.js`. */
  readonly isFile: (path: string) => Promise<boolean>;
}

/** A runner found on this computer, ready to start without a shell. */
export interface FoundRunner {
  /** The program to start: the runner, or on Windows the `node.exe` next to npm's `.cmd` runner. */
  readonly program: string;
  /** Arguments before the runner's own: npm's CLI script when `program` is `node.exe`. */
  readonly leadingArgs: readonly string[];
  /** Folders to put first on the program's `PATH`, so the runner starts the Node found with it. */
  readonly pathFolders: readonly string[];
}

/** The runner, or the reason the launch is refused. */
export type RunnerLookup = { found: FoundRunner } | { refused: string };

/** The endings Windows starts a bare name with when `%PATHEXT%` isn't set. */
const defaultPathExt = ".COM;.EXE;.BAT;.CMD";
/** Endings Node can start without a shell. */
const directEndings = new Set([".com", ".exe"]);
/** Endings only `cmd.exe` can start. */
const shellEndings = new Set([".bat", ".cmd"]);

/**
 * Finds a pinned connector's runner, and for an npm runner the `node` it
 * needs, in the app's own environment only (`programFolders`), never in
 * the connector's `env`. A command with a folder must be a full path, since
 * a relative one would depend on the folder the app happens to run in; on
 * Windows it is tried with the `%PATHEXT%` endings too.
 *
 * On Windows, npm installs `npx` and `npm` as `.cmd` files, which Node
 * can't start without a shell. The launcher starts the `node.exe` next to
 * them with npm's own CLI script instead, or, like the `.cmd` file itself,
 * the `node` it finds in the folders when there is none next to them (as
 * in `%APPDATA%\npm` after `npm i -g npm`). Any other `.cmd` or `.bat` runner
 * is refused: a shell could read the arguments as commands. `uvx.exe` and
 * the other real programs start directly.
 *
 * Python runners need nothing else: `uv` brings its own Python, and
 * `pipx` names its Python in its own first line.
 */
export async function findRunner(
  command: string,
  registry: ConnectorPin["registry"],
  search: RunnerSearch,
): Promise<RunnerLookup> {
  const path = search.platform === "win32" ? win32 : posix;
  if (namesFolder(command, search.platform) && !isFullPath(command, search.platform)) {
    return {
      refused: `"${command}" is a path relative to the folder the app runs in; give its full path or just the program's name`,
    };
  }
  const folders = await programFolders(search);
  const runner = await locate(command, folders, search);
  if (runner === undefined) {
    return {
      refused: `couldn't find "${command}" on this computer; give its full path as the connector's command`,
    };
  }
  const mapped = await withoutShell(runner, folders, search);
  if ("refused" in mapped) return mapped;
  if (registry === "pypi") return mapped;
  const node = await locate("node", [path.dirname(runner), ...folders], search);
  if (node === undefined) {
    return {
      refused: `couldn't find "node" on this computer, which "${command}" needs; give the full path of a "${command}" with "node" in the same folder`,
    };
  }
  const pathFolders = uniqueFolders(
    [...mapped.found.pathFolders, path.dirname(node)],
    search.platform,
  );
  return { found: { ...mapped.found, pathFolders } };
}

/** Whether `command` names a folder or a drive, such as `./npx`, `bin/uvx` or `C:uvx`, rather than just a program. */
function namesFolder(command: string, platform: NodeJS.Platform): boolean {
  return /[\\/]/.test(command) || (platform === "win32" && /^[a-z]:/i.test(command));
}

/**
 * Whether `command` is a full path. On Windows that means a drive letter,
 * a colon and a backslash, or a network share: `\tools\uvx` and `C:uvx`
 * still depend on the drive or folder the app runs in.
 */
function isFullPath(command: string, platform: NodeJS.Platform): boolean {
  if (platform !== "win32") return posix.isAbsolute(command);
  return /^[a-z]:[\\/]/i.test(command) || /^[\\/]{2}[^\\/]/.test(command);
}

/** The full path of a program: tried as written when it names a folder, else the first match in `folders`. */
async function locate(
  name: string,
  folders: readonly string[],
  search: RunnerSearch,
): Promise<string | undefined> {
  const path = search.platform === "win32" ? win32 : posix;
  const places = namesFolder(name, search.platform) ? [""] : folders;
  for (const folder of places) {
    for (const file of candidates(name, search)) {
      const full = folder === "" ? file : path.join(folder, file);
      if (await search.isProgram(full)) return full;
    }
  }
  return undefined;
}

/** The file names a program may have: itself on macOS and Linux, and on Windows with an ending unless it has one. */
function candidates(name: string, search: RunnerSearch): string[] {
  if (search.platform !== "win32") return [name];
  if (win32.extname(name) !== "") return [name];
  const endings = (search.pathExt ?? defaultPathExt)
    .split(";")
    .map((ending) => ending.toLowerCase())
    .filter((ending) => directEndings.has(ending) || shellEndings.has(ending));
  return endings.map((ending) => `${name}${ending}`);
}

/** How to start `runner` without a shell, or why it can't be. */
async function withoutShell(
  runner: string,
  folders: readonly string[],
  search: RunnerSearch,
): Promise<RunnerLookup> {
  const path = search.platform === "win32" ? win32 : posix;
  const folder = path.dirname(runner);
  const ending = path.extname(runner).toLowerCase();
  if (search.platform !== "win32" || !shellEndings.has(ending)) {
    return { found: { program: runner, leadingArgs: [], pathFolders: [folder] } };
  }
  const name = path.basename(runner, path.extname(runner)).toLowerCase();
  if (name === "npx" || name === "npm") {
    const script = path.join(folder, "node_modules", "npm", "bin", `${name}-cli.js`);
    const node = (await search.isFile(script)) ? await npmNode(folder, folders, search) : undefined;
    if (node !== undefined) {
      return { found: { program: node, leadingArgs: [script], pathFolders: [folder] } };
    }
  }
  return {
    refused: `"${path.basename(runner)}" starts only through a shell, which Halonic doesn't use for a pinned connector`,
  };
}

/**
 * The `node.exe` that npm's `.cmd` runner in `folder` would start: the one
 * next to it, else the first one in `folders`. A `node` that is itself a
 * `.cmd` or `.bat` doesn't count, since it too would need a shell.
 */
async function npmNode(
  folder: string,
  folders: readonly string[],
  search: RunnerSearch,
): Promise<string | undefined> {
  const beside = win32.join(folder, "node.exe");
  if (await search.isProgram(beside)) return beside;
  const found = await locate("node", folders, search);
  if (found === undefined || !directEndings.has(win32.extname(found).toLowerCase())) {
    return undefined;
  }
  return found;
}
