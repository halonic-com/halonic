import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, type ParityCase } from "../cases.ts";
import { composeWorkspace } from "../compose.ts";
import { cloneProblems, oldEnvironment, oldTsx } from "../old-repo.ts";
import { goldenText, type OldResult, type Recording, toRecording } from "../recording.ts";

/**
 * pnpm --filter @halonicjs/testing-parity record --old <scratch clone> [--case <id>]...
 *
 * Records the old repo's behaviour on every fixture: composes each case's
 * workspace in a temporary folder, runs the old loader and `validate` there
 * through old-runner.ts, and writes recorded.json next to each case. See the
 * package README for how to make the scratch clone.
 */

const usage = "Usage: record --old <scratch clone of the old repo at 784f78d> [--case <id>]...";

interface Options {
  readonly clone: string;
  readonly only: readonly string[];
}

function parseOptions(argv: readonly string[]): Options | null {
  const clone = argv[argv.indexOf("--old") + 1];
  if (!argv.includes("--old") || clone === undefined) {
    return null;
  }
  const only = argv.flatMap((arg, index) => (arg === "--case" ? [argv[index + 1] ?? ""] : []));
  return { clone: resolve(clone), only };
}

/** One line per case whose error line differs from the fixture's, for the allowed-differences review. */
function lineNotes(
  recordings: readonly { parityCase: ParityCase; recording: Recording }[],
): string {
  const notes = recordings.flatMap(({ parityCase, recording }) =>
    recording.line === null || recording.line.verdict === "same"
      ? []
      : [
          {
            case: parityCase.id,
            about: parityCase.about,
            file: parityCase.expect?.file,
            ...recording.line,
          },
        ],
  );
  return `${JSON.stringify(notes, null, 2)}\n`;
}

function runOld(clone: string, jobs: unknown, scratch: string): OldResult[] {
  const jobsPath = join(scratch, "jobs.json");
  const outPath = join(scratch, "results.json");
  const home = join(scratch, "home");
  mkdirSync(home);
  writeFileSync(jobsPath, JSON.stringify(jobs));
  const runner = fileURLToPath(new URL("../old-runner.ts", import.meta.url));
  const run = spawnSync(oldTsx(clone), [runner, clone, jobsPath, outPath, home], {
    cwd: clone,
    stdio: "inherit",
    env: oldEnvironment(home),
  });
  if (run.status !== 0) {
    throw new Error(`The old runner failed (exit ${run.status ?? "none"})`);
  }
  return JSON.parse(readFileSync(outPath, "utf8")) as OldResult[];
}

function main(argv: readonly string[]): number {
  const options = parseOptions(argv);
  if (options === null) {
    console.error(usage);
    return 2;
  }
  const problems = cloneProblems(options.clone);
  if (problems.length > 0) {
    console.error(`Cannot record from ${options.clone}:\n- ${problems.join("\n- ")}`);
    return 1;
  }
  const fixtures = fileURLToPath(new URL("../../fixtures/", import.meta.url));
  const cases = loadCases(fixtures).filter(
    (c) => options.only.length === 0 || options.only.includes(c.id),
  );
  const scratch = mkdtempSync(join(tmpdir(), "halonic-parity-"));
  try {
    const jobs = cases.map((parityCase, index) => {
      const dir = join(scratch, `workspace-${index}`);
      return { id: parityCase.id, dir, files: composeWorkspace(fixtures, parityCase, dir) };
    });
    const results = runOld(options.clone, jobs, scratch);
    const recordings = cases.map((parityCase, index) => {
      const result = results[index];
      const dir = jobs[index]?.dir ?? "";
      if (result === undefined || result.id !== parityCase.id) {
        throw new Error(`The old runner gave no result for ${parityCase.id}`);
      }
      const recording = toRecording(parityCase, result, [dir, realpathSync(dir)]);
      writeFileSync(join(parityCase.folder, "recorded.json"), goldenText(recording));
      return { parityCase, recording };
    });
    if (options.only.length === 0) {
      writeFileSync(join(fixtures, "old-line-notes.json"), lineNotes(recordings));
    }
    console.log(`Recorded ${recordings.length} case(s) from the old repo.`);
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

process.exitCode = main(process.argv.slice(2));
