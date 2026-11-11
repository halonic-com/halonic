/**
 * A harness agent writes in its working folder from inside the sandbox. A
 * local connector's program runs outside it, with the connector's secrets.
 * The workspace check `workspace.working-folders` refuses a working folder
 * that holds what a connector names, but it only sees paths as written. This
 * is the same rule again on the real file system, right before a program
 * starts (HAL-4739, HAL-4759): through symbolic links and Windows short
 * names, for absolute paths into the workspace, for the program as found on
 * `PATH`, for packages linked into `node_modules`, and for the files a
 * program loads from next to its script without naming them.
 */

import { foldName } from "../../shared/relative-path.ts";
import type { PathLookup, ProgramStart } from "../skill/scripts-folder.ts";

/** What a connector starts, with the environment its program gets. */
export interface ConnectorStart extends ProgramStart {
  readonly env: Readonly<Record<string, string>>;
}

/**
 * How to look at the file system. Core has none, so an adapter passes Node's
 * `resolve`, `realpath`, `readdir` and `stat`.
 */
export interface FolderLookup extends PathLookup {
  /** The names in a folder, through links. Empty when it isn't a folder. Never rejects. */
  list(folder: string): Promise<readonly string[]>;
  /** Whether a file, not a folder, is there, through links. Never rejects. */
  isFile(path: string): Promise<boolean>;
}

/** Where a start's program would load what an agent may write. */
export interface WorkingFolderReach {
  /** The working folder, as given. */
  readonly folder: string;
  /** How the start reaches it, worded to follow "it", such as "runs 'tools/mail.js'". */
  readonly how: string;
}

/**
 * The message for a start that was refused because of `reach`.
 *
 * @example
 * workingFolderRefusal({ folder: "/w/tools", how: "runs '/w/tools/mail.js'" });
 * // "Halonic didn't start the program: it runs '/w/tools/mail.js', in the agent working folder '/w/tools'. …"
 */
export function workingFolderRefusal(reach: WorkingFolderReach): string {
  return (
    `Halonic didn't start the program: it ${reach.how}, in the agent working folder ` +
    `'${reach.folder}'. An agent could change it, and it would run outside the sandbox`
  );
}

/**
 * Whether a start would run or load a file from a harness agent's working
 * folder, checked on real paths. It looks at:
 *
 * 1. the start folder, the program and every path its arguments and `env`
 *    values name, as resolved from the start folder and through symbolic
 *    links (a path that doesn't exist yet is followed as far as it does);
 * 2. the program as given, so the caller checks again with the absolute
 *    path it found on `PATH`;
 * 3. every package in the `node_modules` folders from the start folder up to
 *    the workspace root, where `npx` and `require()` look without being
 *    told: npm and pnpm workspaces link these to folders in the workspace;
 * 4. the folder of each script it runs (the program, or an argument that is
 *    a file) and the folder it starts in, unless that is the workspace root:
 *    a program loads files from there without naming them.
 *
 * Paths are compared without regard to case, with `\` as `/`, as Windows
 * and macOS read them. Reading too much as a path only makes it stricter.
 *
 * @param start - the start, with absolute `cwd`
 * @param workspaceRoot - the workspace's absolute path
 * @param workingFolders - the absolute working folder of every harness agent in the workspace
 * @returns the first reach found, or `null` when the start reaches none
 */
export async function touchesWorkingFolder(
  start: ConnectorStart,
  workspaceRoot: string,
  workingFolders: readonly string[],
  lookup: FolderLookup,
): Promise<WorkingFolderReach | null> {
  if (workingFolders.length === 0) return null;
  const folders = await Promise.all(
    workingFolders.map(async (folder) => ({
      folder,
      forms: await formsOf(folder, folder, lookup),
    })),
  );
  const finds = [
    () => namedPart(start, folders, lookup),
    () => linkedPackage(start.cwd, workspaceRoot, folders, lookup),
    () => scriptFolder(start, workspaceRoot, folders, lookup),
  ];
  for (const find of finds) {
    const reach = await find();
    if (reach !== null) return reach;
  }
  return null;
}

/** A working folder and the forms of its path that are compared. */
interface Folder {
  readonly folder: string;
  readonly forms: readonly string[];
}

/** Rule 1 and 2: a path the start names, read from its folder, inside a working folder. */
async function namedPart(
  start: ConnectorStart,
  folders: readonly Folder[],
  lookup: FolderLookup,
): Promise<WorkingFolderReach | null> {
  const named: { shown: string; how: string }[] = [
    { shown: start.cwd, how: "starts in" },
    { shown: start.program, how: "runs" },
    ...start.args.flatMap((arg, index) =>
      [...pathsIn(arg), ...moduleIn(start.args, index)].map((path) => ({
        shown: path,
        how: "uses",
      })),
    ),
    ...Object.values(start.env).flatMap((value) =>
      pathsIn(value).map((path) => ({ shown: path, how: "uses" })),
    ),
  ];
  for (const { shown, how } of named) {
    const folder = holding(await formsOf(start.cwd, shown, lookup), folders);
    if (folder !== undefined) return { folder, how: `${how} '${shown}'` };
  }
  return null;
}

/**
 * Rule 3: a `node_modules` folder, or a package, `.bin` entry or scoped
 * package in one, that really lives in a working folder. Only the folders
 * from the start folder up to the workspace root are listed: anything above
 * the workspace is out of an agent's reach, and a start outside it (such as
 * a pinned package's new empty folder) has none to list.
 */
async function linkedPackage(
  cwd: string,
  workspaceRoot: string,
  folders: readonly Folder[],
  lookup: FolderLookup,
): Promise<WorkingFolderReach | null> {
  for (const folder of foldersUpTo(cwd, workspaceRoot, lookup)) {
    const modules = lookup.resolve(folder, "node_modules");
    for (const entry of [modules, ...(await packagesIn(modules, lookup))]) {
      const holder = holding([await realPath(entry, lookup)], folders);
      if (holder !== undefined) return { folder: holder, how: `loads '${entry}'` };
    }
  }
  return null;
}

/** The entries of a `node_modules` folder, with those inside `.bin` and `@scope` folders. */
async function packagesIn(modules: string, lookup: FolderLookup): Promise<string[]> {
  const entries: string[] = [];
  for (const name of await lookup.list(modules)) {
    const entry = lookup.resolve(modules, name);
    entries.push(entry);
    if (name === ".bin" || name.startsWith("@")) {
      const inner = await lookup.list(entry);
      entries.push(...inner.map((innerName) => lookup.resolve(entry, innerName)));
    }
  }
  return entries;
}

/** `cwd` and each folder above it up to the workspace root, or none when `cwd` is outside it. */
function foldersUpTo(cwd: string, workspaceRoot: string, lookup: PathLookup): string[] {
  if (!isInside(cwd, workspaceRoot)) return [];
  const chain = [cwd];
  let folder = cwd;
  while (!isSame(folder, workspaceRoot)) {
    const parent = lookup.resolve(folder, "..");
    if (parent === folder) break;
    folder = parent;
    chain.push(folder);
  }
  return chain;
}

/**
 * Rule 4: a working folder inside the folder of a script the start runs, or
 * inside the folder it starts in. The workspace root counts as a script's
 * folder, but not as a start folder: every working folder is inside the
 * root, and the static check already refuses a `node_modules` working folder.
 */
async function scriptFolder(
  start: ConnectorStart,
  workspaceRoot: string,
  folders: readonly Folder[],
  lookup: FolderLookup,
): Promise<WorkingFolderReach | null> {
  for (const script of [start.program, ...start.args]) {
    const path = lookup.resolve(start.cwd, script);
    if (!(await lookup.isFile(path))) continue;
    const scriptFolder = lookup.resolve(await realPath(path, lookup), "..");
    const inside = folders.find((folder) =>
      folder.forms.some((form) => isInside(form, scriptFolder)),
    );
    if (inside !== undefined) {
      return { folder: inside.folder, how: `runs '${script}', which loads files from next to it` };
    }
  }
  const cwd = await realPath(start.cwd, lookup);
  if (isSame(cwd, await realPath(workspaceRoot, lookup))) return null;
  const inside = folders.find((folder) => folder.forms.some((form) => isInside(form, cwd)));
  return inside === undefined
    ? null
    : { folder: inside.folder, how: `starts in '${start.cwd}' and reads files from there` };
}

/** The first working folder that holds one of `forms`. */
function holding(forms: readonly string[], folders: readonly Folder[]): string | undefined {
  return folders.find((folder) =>
    folder.forms.some((folderForm) => forms.some((form) => isInside(form, folderForm))),
  )?.folder;
}

/** A path resolved from `cwd`, and where it really is. */
async function formsOf(cwd: string, path: string, lookup: PathLookup): Promise<string[]> {
  const resolved = lookup.resolve(cwd, path);
  return [resolved, await realPath(resolved, lookup)];
}

/**
 * Where an absolute path really is, through links and Windows short names.
 * When it doesn't exist (yet), the nearest folder above it that does is
 * followed, and the rest is added back, so `out/new.json` in a linked
 * `out` folder is still found.
 */
async function realPath(path: string, lookup: PathLookup): Promise<string> {
  try {
    return await lookup.realpath(path);
  } catch {
    const parent = lookup.resolve(path, "..");
    if (parent === path) return path;
    const rest = path.slice(parent.length).replace(/^[\\/]+/, "");
    return lookup.resolve(await realPath(parent, lookup), rest);
  }
}

/** Whether `path` is `folder` or inside it, as a file system that ignores case reads them. */
function isInside(path: string, folder: string): boolean {
  const comparablePath = comparable(path);
  const comparableFolder = comparable(folder);
  return comparablePath === comparableFolder || comparablePath.startsWith(`${comparableFolder}/`);
}

function isSame(path: string, other: string): boolean {
  return comparable(path) === comparable(other);
}

/**
 * An absolute path as Windows and macOS compare it: folded case, `/` between
 * parts, no trailing dots and spaces on a part, and no `/` at the end.
 */
function comparable(path: string): string {
  return foldName(path)
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => (part === "." || part === ".." ? part : part.replace(/[. ]+$/, "")))
    .join("/")
    .replace(/\/+$/, "");
}

/**
 * The paths an argument or `env` value may name, as in the static check:
 * the whole text, each piece between `;` and spaces (a Windows `PATH` keeps
 * its drive letters), each piece between `=`, `:`, `;`, `@` and spaces (as
 * in `--config=tools/mail.json`, `PATH=tools/bin:/usr/bin`, `file:tools/x`
 * or `@tools/args.txt`), and each piece without its short flag, as in
 * `-ctools/mail.json`.
 */
function pathsIn(text: string): string[] {
  const pieces = [text, ...text.split(/[;\s]+/), ...text.split(/[=:;@\s]+/)];
  const withoutFlags = pieces.flatMap((piece) =>
    /^-[^-]./.test(piece) ? [piece, piece.slice(2)] : [piece],
  );
  return [...new Set(withoutFlags.filter((piece) => piece !== ""))];
}

/** The folder path of a module `python -m` runs: `-m tools.mail` or `-mtools.mail` reads `tools/mail`. */
function moduleIn(args: readonly string[], index: number): string[] {
  const name = moduleName(args[index - 1], args[index] ?? "");
  return name === "" ? [] : [name.replaceAll(".", "/")];
}

/** The module an argument names after `-m`, or with `-m` in front of it; otherwise empty. */
function moduleName(before: string | undefined, arg: string): string {
  if (before === "-m") return arg;
  return arg.startsWith("-m") ? arg.slice(2) : "";
}
