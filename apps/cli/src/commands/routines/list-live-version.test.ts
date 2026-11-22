import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { routinesCommandWith } from "./command.ts";

const weeklyPath = "hubs/support/workflows/routines/weekly-report.routine.yaml";

/** The Weekly report routine, which runs Support reply on `schedule`. */
function weeklyReport(schedule: string): string {
  return [
    "id: weekly-report",
    "name: Weekly report",
    `trigger: { schedule: "${schedule}" }`,
    "run: { workflow: support-reply }",
    "",
  ].join("\n");
}

/** Each test's time, with git on a busy runner (HAL-5244). */
const gitTimeout = 60_000;

let acmeRuns: AcmeRuns;
let runner: GitRunner;
let vcs: GitVcs;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-list-live");
  runner = await GitRunner.create({ git: await testGit() });
  vcs = new GitVcs(acmeRuns.acme, { runner, author: { name: "Test", email: "test@example.com" } });
});

afterEach(async () => {
  await runner.close();
  await removeAcmeRuns(acmeRuns);
});

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

/** Commits every file in the workspace folder as a new version. */
async function makeLive(): Promise<void> {
  const entries = await readdir(acmeRuns.acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acmeRuns.acme, join(entry.parentPath, entry.name)))
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !path.startsWith(".git/"));
  if (!(await vcs.status()).isRepo) await vcs.init();
  await vcs.stage(files);
  await vcs.commit("Weekly report on Mondays");
}

/** `halonic routines` with `args`, opening the history with `opener`. */
async function routinesIn(
  opener: OpenWorkspaceHistory,
  ...args: string[]
): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = routinesCommandWith({ ...acmeRunsSetup(acmeRuns), history: opener });
  const code = await runCli(["routines", ...args], io, [command]);
  return { code, io };
}

verifies("cli.commands.routines.list-live-version", () => {
  it(
    "lists a schedule saved but not live as the watch runs it",
    async () => {
      await writeFiles(acmeRuns.acme, { [weeklyPath]: weeklyReport("0 9 * * 1") });
      await makeLive();
      await writeFiles(acmeRuns.acme, { [weeklyPath]: weeklyReport("0 9 * * 0") });

      const { code, io } = await routinesIn(history);
      const json = await routinesIn(history, "--json");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.slice(0, 2)).toEqual([
        "Weekly report   Mondays at 09:00   Next 16 Nov 09:00   Never ran",
        "! Weekly report has changes that aren't live yet. It runs as last committed until you commit them or make them live in Halonic Studio.",
      ]);
      expect(JSON.parse(json.io.stdout.join("\n")).routines[0]).toMatchObject({
        trigger: "Mondays at 09:00",
        nextRun: "2026-11-16T09:00:00.000Z",
      });
    },
    gitTimeout,
  );

  // C610 #1 (HAL-15664): the watch doesn't run a routine no commit has.
  it(
    "lists a routine that has never been live with no next run, and says it doesn't run",
    async () => {
      await makeLive();
      await writeFiles(acmeRuns.acme, { [weeklyPath]: weeklyReport("0 9 * * 0") });

      const { code, io } = await routinesIn(history);
      const json = await routinesIn(history, "--json");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.slice(0, 2)).toEqual([
        "Weekly report   Sundays at 09:00   Not live yet   Never ran",
        "! Weekly report isn't live yet, so it doesn't run. To start it, commit it or make it live in Halonic Studio.",
      ]);
      expect(JSON.parse(json.io.stdout.join("\n")).routines[0]).toMatchObject({
        nextRun: null,
        liveState: "never-live",
      });
    },
    gitTimeout,
  );

  // C610 #2 (HAL-15664): the watch runs the last commit's routine, which can start.
  it(
    "lists a routine whose saved changes have errors as the watch runs it, and names the errors under the list",
    async () => {
      await writeFiles(acmeRuns.acme, { [weeklyPath]: weeklyReport("0 9 * * 1") });
      await makeLive();
      await writeFiles(acmeRuns.acme, {
        [weeklyPath]: weeklyReport("0 9 * * 1").replace("support-reply", "support-reply-typo"),
      });

      const { code, io } = await routinesIn(history);
      const json = await routinesIn(history, "--json");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.slice(0, 2)).toEqual([
        "Weekly report   Mondays at 09:00   Next 16 Nov 09:00   Never ran",
        "! Weekly report has changes that aren't live yet, and they have errors (halonic validate). It runs as last committed.",
      ]);
      expect(JSON.parse(json.io.stdout.join("\n")).routines[0]).toMatchObject({
        nextRun: "2026-11-16T09:00:00.000Z",
        problems: 0,
        savedProblems: 1,
        liveState: "not-live",
      });
    },
    gitTimeout,
  );

  // C642 #2 (HAL-15863): the top line pointed to validate, which reads the fixed saved file.
  it(
    "says a routine whose fix is saved but not committed can't start until it is committed",
    async () => {
      const fixed = weeklyReport("0 9 * * 1");
      await writeFiles(acmeRuns.acme, {
        [weeklyPath]: fixed.replace("support-reply", "support-reply-typo"),
      });
      await makeLive();
      await writeFiles(acmeRuns.acme, { [weeklyPath]: fixed });

      const { code, io } = await routinesIn(history);

      expect(code).toBe(exitCode.failed);
      expect(io.stdout.slice(0, 3)).toEqual([
        "! 1 routine can't start until its fix is committed",
        "Weekly report   Mondays at 09:00   ✕ Can't start   Never ran",
        "! Weekly report's fix isn't live yet, so it can't start. To start it, commit the fix or make it live in Halonic Studio.",
      ]);
    },
    gitTimeout,
  );
});

verifies("cli.commands.routines.list", () => {
  // HAL-15525 with HAL-15664: trusting Acme wouldn't start a routine no commit has.
  it(
    "says Not live yet, not Paused until trusted, for a routine never live in an untrusted workspace",
    async () => {
      await writeFiles(acmeRuns.acme, {
        "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
      });
      await makeLive();
      await writeFiles(acmeRuns.acme, { [weeklyPath]: weeklyReport("0 9 * * 0") });

      const { io } = await routinesIn(history);

      expect(io.stdout.slice(0, 2)).toEqual([
        "Weekly report   Sundays at 09:00   Not live yet   Never ran",
        "! Weekly report isn't live yet, so it doesn't run. To start it, commit it or make it live in Halonic Studio.",
      ]);
    },
    gitTimeout,
  );
});
