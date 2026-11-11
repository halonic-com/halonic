// A harness agent writes in its working folder from inside the sandbox. A
// local connector's program runs outside it, with the connector's secrets.
// If that program, or a file it reads, were in an agent's working folder,
// the agent could rewrite what runs outside the sandbox, and no change would
// be recorded for review (HAL-4732). So a working folder may not hold
// anything a local connector starts in, names or loads without naming.

import {
  type Connector,
  defaultWorkingFolder,
  foldName,
  isInWorkingFolder,
} from "@halonicjs/format";
import { posixPath } from "@halonicjs/std";
import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

/** A path a local connector's start names, read from the folder it starts in. */
interface StartPart {
  /** The path, relative to the workspace root. */
  readonly path: string;
  /** The argument, program or `NAME=value` the path comes from, for the message. */
  readonly shown: string;
}

const CODE = "working-folder-runs-program";

/**
 * Harness agents whose working folder a local connector's program would
 * load files from, reported on the agent's `workingFolder`: a folder with a
 * `node_modules` part, and, once per connector, a folder that holds what the
 * connector starts in, runs or names, or that lies inside the folder it
 * starts in. Every local connector counts, pinned or not: a pinned program
 * starts in a folder of its own, but its arguments can still name a file it
 * reads, such as its settings.
 */
export function checkWorkingFolders(context: CheckContext): WorkspaceIssue[] {
  const connectors = context.filesOf("connector");
  const issues: WorkspaceIssue[] = [];
  for (const agent of context.filesOf("agent").filter(runsInHarness)) {
    const folder = agent.value.workingFolder ?? defaultWorkingFolder(agent.value.id);
    const refuse = (reason: string) =>
      issues.push(
        context.error(
          agent.path,
          ["workingFolder"],
          CODE,
          `Agent "${agent.value.id}" can't write in '${folder}': ${reason}, outside the sandbox`,
        ),
      );
    if (hasNodeModulesPart(folder)) {
      refuse("programs load the packages in a node_modules folder without naming them");
    }
    for (const connector of connectors) {
      const reason = connectorReach(connector.value, folder);
      if (reason !== undefined) refuse(`connector "${connector.value.id}" ${reason}`);
    }
  }
  return issues;
}

type AgentFile = LoadedFileOf<"agent">;

/** An agent that runs in Claude Code, Codex or another program, not in Halonic's own loop. */
function runsInHarness(agent: AgentFile): boolean {
  return agent.value.harness !== undefined && agent.value.harness !== "halonic";
}

/**
 * `npx` and `node` look for packages in `node_modules` folders without being
 * told where, so a working folder may have no `node_modules` part at all.
 */
function hasNodeModulesPart(folder: string): boolean {
  return folder.split("/").some((part) => foldName(part) === "node_modules");
}

/**
 * How a local connector would load files from `folder`, worded for the
 * message, or `undefined` when it wouldn't. A program reads its packages,
 * `package.json`, `pyproject.toml` and virtual environments from the folder
 * it starts in, so a working folder inside that folder counts too. The
 * workspace root is the exception, as every working folder is inside it:
 * there, `node_modules` is refused on its own, and a file a program loads
 * from the root without naming it is left to the step that starts programs.
 */
function connectorReach(connector: Connector, folder: string): string | undefined {
  if (!("stdio" in connector.transport)) return undefined;
  const { cwd = "." } = connector.transport.stdio;
  const parts = startParts(connector);
  const part = parts.find((start) => isInWorkingFolder(start.path, folder));
  if (part !== undefined) return `uses '${part.shown}' from there`;
  if (!isWorkspaceRoot(cwd) && isInWorkingFolder(folder, cwd)) {
    return `starts in '${cwd}', which holds it, and reads files from there`;
  }
  for (const start of parts) {
    const holder = loadFolders(start.path).find((loaded) => isInWorkingFolder(folder, loaded));
    if (holder !== undefined) {
      return `uses '${start.shown}' and loads files from '${holder}', which holds it`;
    }
  }
  return undefined;
}

/**
 * The folders a program may load files from because a start part names
 * `path`: the path itself, as a folder in `PYTHONPATH` or `NODE_PATH` is,
 * and the folder it is in, as Node and Python load files next to the script
 * they run. The workspace root is left out, as every working folder is
 * inside it. `\` reads as `/` before taking the parent folder, as
 * `posixPath.dirname` only splits on `/` and Windows splits on both.
 */
function loadFolders(path: string): string[] {
  const slashed = path.replaceAll("\\", "/");
  return [slashed, posixPath.dirname(slashed)].filter((loaded) => !isWorkspaceRoot(loaded));
}

/**
 * For a connector that starts a program on this computer: the folder it
 * starts in, its program, and every path its arguments and plain `env`
 * values name, each read from the start folder. A bare program name such as
 * `node` reads as a file in the start folder, so it is inside a working
 * folder only when that folder is. `secretEnv` holds secret names, not
 * paths, so it isn't read. A connector that starts no program has no parts.
 */
function startParts(connector: Connector): StartPart[] {
  if (!("stdio" in connector.transport)) return [];
  const { cwd = ".", command, args, env = {} } = connector.transport.stdio;
  const named = (shown: string, paths: readonly string[]): StartPart[] =>
    paths.map((path) => ({ path: inFolder(cwd, path), shown }));
  return [
    { path: cwd, shown: cwd },
    ...named(command, [command]),
    ...args.flatMap((arg, index) => named(arg, [...pathsIn(arg), ...moduleIn(args, index)])),
    ...Object.entries(env).flatMap(([name, value]) => named(`${name}=${value}`, pathsIn(value))),
  ];
}

/**
 * The paths an argument or `env` value may name: the whole text, each piece
 * between `=`, `:`, `;`, `@` and spaces (as in `--config=tools/mail.json`,
 * `PATH=tools/bin:/usr/bin`, `file:tools/x` or `@tools/args.txt`), and each
 * piece without its short flag, as in `-ctools/mail.json`. Reading too many
 * pieces as paths only makes the check stricter.
 */
function pathsIn(text: string): string[] {
  const pieces = [text, ...text.split(/[=:;@\s]+/)];
  const withoutFlags = pieces.flatMap((piece) =>
    /^-[^-]./.test(piece) ? [piece, piece.slice(2)] : [piece],
  );
  return [...new Set(withoutFlags.filter((piece) => piece !== ""))];
}

/**
 * The folder path of a module that `python -m` runs, from the argument after
 * `-m` or one written together with it as `-mtools.mail`: Python reads
 * `tools.mail` as `tools/mail`.
 */
function moduleIn(args: readonly string[], index: number): string[] {
  const name = moduleName(args[index - 1], args[index] ?? "");
  return name === "" ? [] : [name.replaceAll(".", "/")];
}

/** The module an argument names after `-m`, or with `-m` in front of it; otherwise empty. */
function moduleName(before: string | undefined, arg: string): string {
  if (before === "-m") return arg;
  return arg.startsWith("-m") ? arg.slice(2) : "";
}

/** Whether a connector's `cwd` is the workspace root, written as `.`, `./` or the like. */
function isWorkspaceRoot(cwd: string): boolean {
  // Only the root holds the empty path `.`: any other folder has a part of its own.
  return isInWorkingFolder(".", cwd);
}

/** `path` read from `folder`: an absolute path, in either slash style or with a drive, stays as it is. */
function inFolder(folder: string, path: string): string {
  return /^([\\/]|[a-z]:)/i.test(path) ? path : posixPath.join(folder, path);
}
