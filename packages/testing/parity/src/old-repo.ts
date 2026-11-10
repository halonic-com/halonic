import {
  execFileSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
  spawnSync,
} from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The full hash of the reference commit, so a short-hash clash can't slip through. */
export const referenceHash = "784f78d317daffa5e5ad0329efb2e9fbb4f79dec";

/**
 * The time the old clock stands at while workflow tests run. It doesn't tick:
 * only a test's `advance` steps move it, so the run logs don't depend on how
 * often the old engine reads the clock.
 */
export const fixedTestTime = "2026-01-01T00:00:00.000Z";

/** The old repo's `tsx`, installed in the clone by `pnpm install`. */
export function oldTsx(clone: string): string {
  return join(clone, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
}

/**
 * Runs the old repo's `tsx` with the given arguments. On Windows `.bin/tsx.cmd`
 * is a batch file, which Node can only start through the command interpreter,
 * so the line is quoted by hand and passed on as it is.
 */
export function runOldTsx(
  clone: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string> {
  const tsx = oldTsx(clone);
  if (process.platform !== "win32") {
    return spawnSync(tsx, args, options);
  }
  const line = [tsx, ...args].map((arg) => `"${arg}"`).join(" ");
  return spawnSync(process.env["ComSpec"] ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
    ...options,
    windowsVerbatimArguments: true,
  });
}

/**
 * The environment the old code runs in: an empty home folder (so no secrets
 * or settings of the person recording are read), UTC and a plain locale.
 * Only what Node needs to start (PATH and the library path, or the system folder on Windows) is passed through.
 */
export function oldEnvironment(home: string): Record<string, string> {
  const environment: Record<string, string> = {
    HOME: home,
    USERPROFILE: home,
    TZ: "UTC",
    LANG: "C",
    NO_COLOR: "1",
  };
  // Windows can't start Node or the command interpreter without its system folder and PATHEXT.
  for (const name of ["PATH", "LD_LIBRARY_PATH", "SystemRoot", "ComSpec", "PATHEXT"]) {
    const value = process.env[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return environment;
}

function git(clone: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", clone, ...args], { encoding: "utf8" }).trim();
}

/**
 * Problems that make a clone unfit to record from: another commit, changed
 * tracked files, or no installed dependencies. Empty when the clone is fine.
 *
 * @param expected - the commit the clone must be at; tests pass their own
 */
export function cloneProblems(clone: string, expected: string = referenceHash): string[] {
  if (!existsSync(join(clone, ".git"))) {
    return [`${clone} is not a git clone`];
  }
  const problems: string[] = [];
  const head = git(clone, ["rev-parse", "HEAD"]);
  if (head !== expected) {
    problems.push(
      `the clone is at ${head.slice(0, 7)}, not at the reference ${expected.slice(0, 7)}`,
    );
  }
  if (git(clone, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    problems.push("the clone has changed files; recordings must come from the commit as it is");
  }
  if (!existsSync(oldTsx(clone))) {
    problems.push("the clone has no node_modules/.bin/tsx; run pnpm install in it first");
  }
  return problems;
}
