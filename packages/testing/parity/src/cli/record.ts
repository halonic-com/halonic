import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, type ParityCase } from "../cases.ts";
import { baseCliCalls, type CliCall } from "../cli-calls.ts";
import { composeWorkspace } from "../compose.ts";
import { cloneProblems, oldEnvironment, oldTsx, referenceHash } from "../old-repo.ts";
import {
  goldenText,
  type OldResult,
  type Recording,
  toCliRecording,
  toRecording,
  toRunLogs,
} from "../recording.ts";

/**
 * pnpm --filter @halonicjs/testing-parity record --old <scratch clone> [--case <id>]...
 *
 * Records the old repo's behaviour on every fixture: composes each case's
 * workspace in a temporary folder, runs the old loader and `validate` there
 * through old-runner.ts, and writes recorded.json next to each case. For the
 * base it also writes the old test runner's run logs (run-logs.json) and the
 * old CLI's `test` and `run` output (cli.json). See the package README for how
 * to make the scratch clone.
 */

const usage = "Usage: record --old <scratch clone of the old repo at 784f78d> [--case <id>]...";

interface Options {
  readonly clone: string;
  readonly only: readonly string[];
}

/** The files one run of old-runner.ts reads and writes, all in the scratch folder. */
export interface RunnerFiles {
  readonly jobs: string;
  readonly results: string;
  readonly home: string;
}

/** Runs old-runner.ts on a clone and returns its exit status (null if it was killed). */
export type StartRunner = (clone: string, files: RunnerFiles) => number | null;

/** Starts old-runner.ts with the clone's own tsx, in the clone, with a clean environment. */
const startOldRunner: StartRunner = (clone, files) => {
  const runner = fileURLToPath(new URL("../old-runner.ts", import.meta.url));
  const run = spawnSync(oldTsx(clone), [runner, clone, files.jobs, files.results, files.home], {
    cwd: clone,
    stdio: "inherit",
    env: oldEnvironment(files.home),
  });
  return run.status;
};

/**
 * Where the fixtures are, which commit the clone must be at and how the old
 * runner starts; tests pass their own.
 */
export interface Setup {
  readonly fixtures: string;
  readonly reference: string;
  readonly startRunner?: StartRunner;
  /** The old CLI calls to record on the base. */
  readonly cliCalls?: readonly CliCall[];
}

const defaultSetup: Setup = {
  fixtures: fileURLToPath(new URL("../../fixtures/", import.meta.url)),
  reference: referenceHash,
  cliCalls: baseCliCalls,
};

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

function runOld(start: StartRunner, clone: string, jobs: unknown, scratch: string): OldResult[] {
  const files: RunnerFiles = {
    jobs: join(scratch, "jobs.json"),
    results: join(scratch, "results.json"),
    home: join(scratch, "home"),
  };
  mkdirSync(files.home);
  writeFileSync(files.jobs, JSON.stringify(jobs));
  const status = start(clone, files);
  if (status !== 0) {
    throw new Error(`The old runner failed (exit ${status ?? "none"})`);
  }
  return JSON.parse(readFileSync(files.results, "utf8")) as OldResult[];
}

/** Records every case (or only the --case ones) and returns the exit code. */
export function main(argv: readonly string[], setup: Setup = defaultSetup): number {
  const options = parseOptions(argv);
  if (options === null) {
    console.error(usage);
    return 2;
  }
  const problems = cloneProblems(options.clone, setup.reference);
  if (problems.length > 0) {
    console.error(`Cannot record from ${options.clone}:\n- ${problems.join("\n- ")}`);
    return 1;
  }
  const { fixtures } = setup;
  const cases = loadCases(fixtures).filter(
    (c) => options.only.length === 0 || options.only.includes(c.id),
  );
  const scratch = mkdtempSync(join(tmpdir(), "halonic-parity-"));
  try {
    const jobs = cases.map((parityCase, index) => {
      const dir = join(scratch, `workspace-${index}`);
      const files = composeWorkspace(fixtures, parityCase, dir);
      // Only the base gets run logs and CLI calls: a case breaks the workspace on purpose.
      const base = parityCase.id === "base";
      return {
        id: parityCase.id,
        dir,
        files,
        tests: base,
        ...(base && setup.cliCalls !== undefined ? { cli: setup.cliCalls } : {}),
      };
    });
    const start = setup.startRunner ?? startOldRunner;
    const results = runOld(start, options.clone, jobs, scratch);
    const recordings = cases.map((parityCase, index) => {
      const result = results[index];
      const dir = jobs[index]?.dir ?? "";
      if (result === undefined || result.id !== parityCase.id) {
        throw new Error(`The old runner gave no result for ${parityCase.id}`);
      }
      const dirs = [dir, realpathSync(dir)];
      const recording = toRecording(parityCase, result, dirs);
      writeFileSync(join(parityCase.folder, "recorded.json"), goldenText(recording));
      if (result.tests !== undefined) {
        const runLogs = toRunLogs(parityCase, result.tests, dirs);
        writeFileSync(join(parityCase.folder, "run-logs.json"), goldenText(runLogs));
      }
      if (result.cli !== undefined) {
        const cli = toCliRecording(parityCase, result.cli);
        writeFileSync(join(parityCase.folder, "cli.json"), goldenText(cli));
      }
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

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
