/**
 * Halonic never runs a file under a skill's `scripts/` folder (HAL-188). The
 * trust gate is the main control; this is the defence behind it, shared by
 * every adapter that starts a program so they all refuse the same starts.
 */

import { type ProgramStart, pathsNamedBy } from "../../shared/program-start.ts";

/** Why a start was refused. */
export const skillScriptsRefusal = "Halonic never runs a file under a skill's scripts/ folder";

/**
 * How to find where a path leads. Core has no file system, so an adapter
 * passes Node's `resolve` (from `node:path`) and `realpath` (from
 * `node:fs/promises`).
 */
export interface PathLookup {
  /** The absolute path of `part`, read from `cwd`. */
  resolve(cwd: string, part: string): string;
  /** Where `path` really is, through symbolic links. Rejects when nothing is there. */
  realpath(path: string): Promise<string>;
}

/**
 * A path with a `skills/<name>/scripts` part, in either slash style and any
 * letter case, since macOS and Windows file systems ignore case. The part may
 * also follow an `=`, as in `--file=skills/x/scripts/a.js`.
 */
const skillScripts = /(^|[\\/=])skills[\\/][^\\/]+[\\/]scripts([\\/]|$)/i;

/**
 * Whether the folder a start begins in, or a path it names (the program,
 * every path its arguments and `env` values name, read as
 * {@link pathsNamedBy} reads them) points under a skill's `scripts/`
 * folder: as written, resolved against `cwd`, or through symbolic links to
 * where the file really is.
 */
export async function touchesSkillScripts(
  start: ProgramStart,
  paths: PathLookup,
): Promise<boolean> {
  const parts = [start.cwd, ...pathsNamedBy(start).map((named) => named.path)];
  for (const part of new Set(parts)) {
    if (await pointsAtSkillScripts(start.cwd, part, paths)) return true;
  }
  return false;
}

async function pointsAtSkillScripts(
  cwd: string,
  part: string,
  paths: PathLookup,
): Promise<boolean> {
  const path = paths.resolve(cwd, part);
  if (skillScripts.test(part) || skillScripts.test(path)) return true;
  // A part that isn't a file there (a bare name, a flag) has no link to follow.
  const real = await paths.realpath(path).catch(() => path);
  return skillScripts.test(real);
}
