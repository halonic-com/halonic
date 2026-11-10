import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { type PathLookup, touchesSkillScripts } from "@halonicjs/format";

/** How long the login shell may take to print its `PATH`. */
export const loginShellTimeoutMs = 5_000;

/** Marks where the `PATH` starts and ends, so whatever a profile prints around it is ignored. */
const marker = "__HALONIC_PATH__";

/** Node's way to find where a path leads, for the shared skill `scripts/` check. */
const nodePaths: PathLookup = { resolve, realpath };

/**
 * The `PATH` the person's login shell sets, which a macOS desktop app
 * doesn't inherit: Homebrew and others add their folders in a login
 * profile. It runs `$SHELL -l -c` with a fixed script that prints only
 * `PATH`, with no arguments from any workspace, and a time limit.
 *
 * A login shell that isn't interactive reads only the login profiles
 * (`.zprofile`, `.bash_profile`, `.profile`), not `.zshrc` or what
 * `.bashrc` adds, which is where nvm and fnm are usually set up. So a
 * runner from them may not be found; the launcher's refusal then asks for
 * the runner's full path. `-i` would read those files too, but also start
 * whatever they start for a terminal (prompts, tmux), so it isn't used.
 *
 * On a timeout only the shell is stopped: anything its profile started
 * in the background keeps running.
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
  if (await touchesSkillScripts({ cwd: home, program: shell, args: [] }, nodePaths)) {
    return undefined;
  }
  return new Promise((settle) => {
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
          settle(undefined);
          return;
        }
        settle(new RegExp(`${marker}(.*?)${marker}`, "s").exec(stdout)?.[1]);
      },
    );
  });
}
