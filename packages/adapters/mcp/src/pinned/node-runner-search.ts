import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import type { RunnerSearch } from "./find-runner.ts";
import { readLoginShellPath } from "./login-shell-path.ts";

/**
 * The {@link RunnerSearch} for this computer, from the app's own
 * environment (usually `process.env`). The login shell is asked at most
 * once per search, so one search kept for the app's lifetime asks it once
 * per app start.
 */
export function createRunnerSearch(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): RunnerSearch {
  let loginShellPath: Promise<string | undefined> | undefined;
  return {
    platform,
    path: variable(env, "PATH", platform) ?? "",
    pathExt: variable(env, "PATHEXT", platform),
    home: platform === "win32" ? env["USERPROFILE"] : env["HOME"],
    programFiles: env["ProgramFiles"],
    appData: env["APPDATA"],
    loginShellPath: () => {
      loginShellPath ??= readLoginShellPath(env);
      return loginShellPath;
    },
    isProgram: (path) => isFile(path, platform === "win32" ? constants.F_OK : constants.X_OK),
    isFile: (path) => isFile(path, constants.F_OK),
  };
}

/** A variable by name, which Windows reads in any letter case (`Path`, `PATH`). */
function variable(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== "win32") return env[name];
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

async function isFile(path: string, mode: number): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, mode);
    return true;
  } catch {
    // Missing, not a file, or not ours to run: either way not a match.
    return false;
  }
}
