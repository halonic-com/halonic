import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliCall } from "./cli-calls.ts";
import { fixedTestTime, oldEnvironment, oldTsx } from "./old-repo.ts";
import type { OldCliRun } from "./recording.ts";

/** Every file under a folder, relative to it, sorted. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

/**
 * Runs one old CLI call on a fresh copy of the workspace, with the clock and
 * random source fixed by old-cli-preload.ts. Returns its output, the runs it
 * stored (`.studio/runs/<id>.jsonl`, each event in order) and every file it
 * wrote under `.studio`, with the copy's folder replaced by `<workspace>`.
 */
function runOnce(oldRoot: string, home: string, dir: string, call: CliCall): OldCliRun {
  const copy = `${dir}-cli`;
  rmSync(copy, { recursive: true, force: true });
  cpSync(dir, copy, { recursive: true });
  const root = realpathSync(copy);
  try {
    const preload = fileURLToPath(new URL("./old-cli-preload.ts", import.meta.url));
    const args = call.args.map((arg) => (arg === "<workspace>" ? root : arg));
    const result = spawnSync(
      oldTsx(oldRoot),
      ["--import", preload, "apps/cli/src/main.ts", ...args],
      {
        cwd: oldRoot,
        encoding: "utf8",
        env: { ...oldEnvironment(home), PARITY_FIXED_TIME: fixedTestTime },
      },
    );
    const runsDir = join(root, ".studio", "runs");
    const runs = filesUnder(runsDir)
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => ({
        id: file.slice(0, -".jsonl".length),
        events: readFileSync(join(runsDir, file), "utf8")
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line) as unknown),
      }));
    const run: OldCliRun = {
      name: call.name,
      args: [...call.args],
      exitCode: result.status ?? -1,
      stdout: result.stdout,
      stderr: result.stderr,
      runs,
      stored: filesUnder(join(root, ".studio")),
    };
    // The folder as it is written inside JSON strings.
    const written = JSON.stringify(root).slice(1, -1);
    return JSON.parse(JSON.stringify(run).split(written).join("<workspace>")) as OldCliRun;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

/**
 * Runs each old CLI call on the workspace twice: if the two differ, the old
 * CLI still reads the real clock or a random source, or races, and this stops
 * rather than record it.
 *
 * @param oldRoot - the scratch clone of the old repo
 * @param home - the empty home folder the old code runs with
 */
export function runOldCli(
  oldRoot: string,
  home: string,
  dir: string,
  calls: readonly CliCall[],
): OldCliRun[] {
  return calls.map((call) => {
    const first = runOnce(oldRoot, home, dir, call);
    const second = runOnce(oldRoot, home, dir, call);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(
        `The old CLI's "${call.name}" gave other output on a second run; fix the clock, IDs or order first`,
      );
    }
    return first;
  });
}
