/**
 * Halonic never runs a file under a skill's `scripts/` folder (HAL-188). The
 * trust gate is the main control; this is the defence behind it, shared by
 * every adapter that starts a program so they all refuse the same starts.
 */

/** Why a start was refused. */
export const skillScriptsRefusal = "Halonic never runs a file under a skill's scripts/ folder";

/** What a start would run: the program, its arguments and the folder it starts in. */
export interface ProgramStart {
  cwd: string;
  program: string;
  args: readonly string[];
}

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
 * Whether the program, an argument or the folder it starts in points under a
 * skill's `scripts/` folder: as written, resolved against `cwd`, or through
 * symbolic links to where the file really is.
 */
export async function touchesSkillScripts(
  start: ProgramStart,
  paths: PathLookup,
): Promise<boolean> {
  for (const part of partsOf(start)) {
    if (await pointsAtSkillScripts(start.cwd, part, paths)) return true;
  }
  return false;
}

/**
 * Every part of a start that could name a file: the folder, the program, each
 * argument, and the value of an argument joined with `=`, which the program
 * may read as a path of its own. Only the value after the first `=` is
 * followed through links; a later `=` value, as in `--define=KEY=value`, is
 * caught only as written, by the pattern above.
 */
function partsOf({ cwd, program, args }: ProgramStart): string[] {
  return [cwd, program, ...args, ...args.flatMap(joinedValue)];
}

/** The text after the first `=` of `--name=value`, or nothing. */
function joinedValue(arg: string): string[] {
  const equals = arg.indexOf("=");
  return equals === -1 ? [] : [arg.slice(equals + 1)];
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
