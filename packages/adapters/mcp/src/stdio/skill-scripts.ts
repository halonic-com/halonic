import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * A path with a `skills/<name>/scripts` part, in either slash style and any
 * letter case, since macOS and Windows file systems ignore case. The same
 * rule as `sandbox-srt`'s runner, which doesn't export it.
 */
const skillScripts = /(^|[\\/])skills[\\/][^\\/]+[\\/]scripts([\\/]|$)/i;

/** Why a start was refused. */
export const skillScriptsRefusal = "Halonic never runs a file under a skill's scripts/ folder";

/**
 * Whether the program, an argument or the folder it starts in points under
 * a skill's `scripts/` folder: as written, resolved against `cwd`, or
 * through symbolic links to where the file really is. Halonic never runs
 * those files (HAL-188).
 */
export async function touchesSkillScripts(
  cwd: string,
  program: string,
  args: readonly string[],
): Promise<boolean> {
  for (const part of [cwd, program, ...args]) {
    if (await pointsAtSkillScripts(cwd, part)) return true;
  }
  return false;
}

async function pointsAtSkillScripts(cwd: string, part: string): Promise<boolean> {
  const path = resolve(cwd, part);
  if (skillScripts.test(part) || skillScripts.test(path)) return true;
  // A part that isn't a file there (a bare name, a flag) has no link to follow.
  const real = await realpath(path).catch(() => path);
  return skillScripts.test(real);
}
