import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { touchesSkillScripts } from "../stdio/skill-scripts.ts";

/** How long the login shell may take to print its `PATH`. */
export const loginShellTimeoutMs = 5_000;

/** Marks where the `PATH` starts and ends, so whatever a profile prints around it is ignored. */
const marker = "__HALONIC_PATH__";

/**
 * The `PATH` the person's login shell sets, which a macOS desktop app
 * doesn't inherit: Homebrew, Volta, fnm, nvm and the like add their folders
 * in the shell's profile. It runs `$SHELL -l -c` with a fixed script that
 * prints only `PATH`, with no arguments from any workspace, and a time limit.
 *
 * @returns the `PATH`, or `undefined` when `SHELL` isn't an absolute path,
 *   is under a skill's `scripts/` folder, or the shell fails or takes too
 *   long. The launcher then looks in the inherited `PATH` and the usual
 *   install folders only, so a broken profile can't stop a connector.
 */
export async function readLoginShellPath(
  env: Readonly<Record<string, string | undefined>>,
): Promise<string | undefined> {
  const shell = env["SHELL"];
  const home = env["HOME"];
  if (shell === undefined || !isAbsolute(shell)) return undefined;
  if (home === undefined || !isAbsolute(home)) return undefined;
  if (await touchesSkillScripts(home, shell, [])) return undefined;
  return new Promise((resolve) => {
    execFile(
      shell,
      ["-l", "-c", `printf '${marker}%s${marker}' "$PATH"`],
      {
        cwd: home,
        env: { ...env },
        timeout: loginShellTimeoutMs,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error !== null) {
          resolve(undefined);
          return;
        }
        resolve(new RegExp(`${marker}(.*?)${marker}`, "s").exec(stdout)?.[1]);
      },
    );
  });
}
