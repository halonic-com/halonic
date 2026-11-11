// What other packages' tests need to run git, as this package's own tests
// do. Only tests import it: it is not part of the adapter.

import { access, constants } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findGit } from "./find-git.ts";
import { runProcess } from "./node/run-process.ts";

/** The test process's environment without its `GIT_*` variables, and with no system or user config. */
export function plainEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.toUpperCase().startsWith("GIT_")) environment[name] = value;
  }
  return { ...environment, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
}

let gitItself: Promise<string> | undefined;

/**
 * The git program the tests run: git itself, from its `--exec-path`
 * folder, so a wrapper script found as `git` on the `PATH` (an agent
 * runner's launcher, HAL-4373) doesn't stand between the tests and git.
 * It is the `git` on the `PATH` when that folder has none.
 */
export async function testGit(): Promise<string> {
  gitItself ??= (async () => {
    const onPath = await findGit();
    const result = await runProcess({
      program: onPath,
      args: ["--exec-path"],
      cwd: tmpdir(),
      env: plainEnvironment(),
      timeoutMs: 60_000,
      maxOutputBytes: 1024 * 1024,
    });
    const execPath = result.stdout.toString("utf8").trim();
    for (const name of ["git", "git.exe"]) {
      const candidate = join(execPath, name);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here: try the next name.
      }
    }
    return onPath;
  })();
  return gitItself;
}
