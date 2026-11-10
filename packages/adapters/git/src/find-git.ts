import { type FindProgramOptions, findProgram } from "@halonicjs/adapter-system-node";

/** Where to look for git: the `PATH` and the platform it is read on. */
export type FindGitOptions = FindProgramOptions;

/**
 * The absolute path of the `git` program, from the absolute folders of the
 * `PATH` in their order. It is {@link findProgram} for git: relative folders
 * and, on Windows, the current folder are never searched, and only
 * `git.exe` counts there, never `git.cmd` or `git.bat`.
 *
 * @throws Error when no folder of the `PATH` has git
 */
export async function findGit(options: FindGitOptions = {}): Promise<string> {
  const git = await findProgram("git", options);
  if (git !== undefined) return git;
  throw new Error(
    "git was not found in any absolute folder of the PATH. Install git and try again.",
  );
}
