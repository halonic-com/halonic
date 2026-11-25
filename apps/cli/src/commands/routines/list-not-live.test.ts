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

const hint =
  "Routines start on time only while this workspace is open in Halonic Studio, or while `halonic serve` or `halonic routines watch` is running.";
const routinePath = "hubs/support/workflows/routines/morning.routine.yaml";

/** Morning check of the support hub, on `schedule`. */
function morning(schedule: string, more = ""): string {
  return `id: morning\nname: Morning check\ntrigger: { schedule: "${schedule}" }\nrun: { workflow: support-reply }\n${more}`;
}

/** Each test's time, with git on a busy runner (HAL-5244). */
const gitTimeout = 60_000;

let acmeRuns: AcmeRuns;
let runner: GitRunner;
let vcs: GitVcs;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-list-not-live");
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

/**
 * Commits the routine's file as a new version, with the workflow it starts,
 * so the live version's routine can start (HAL-15664).
 */
async function makeLive(): Promise<void> {
  if (!(await vcs.status()).isRepo) await vcs.init();
  await vcs.stage([
    "workspace.yaml",
    "hubs/support/hub.yaml",
    "hubs/support/workflows/support-reply.workflow.yaml",
    routinePath,
  ]);
  await vcs.commit("Morning check");
}

/** Opens no history: git can't start, as when it isn't installed. */
const noGit: OpenWorkspaceHistory = () =>
  Promise.reject(new Error("git wasn't found on the PATH."));

async function routinesIn(opener = history): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = routinesCommandWith({ ...acmeRunsSetup(acmeRuns), history: opener });
  const code = await runCli(["routines"], io, [command]);
  return { code, io };
}

verifies("cli.commands.routines.list", () => {
  it(
    "says a routine whose saved changes aren't committed isn't live yet",
    async () => {
      await writeFiles(acmeRuns.acme, { [routinePath]: morning("0 8 * * *") });
      await makeLive();
      await writeFiles(acmeRuns.acme, { [routinePath]: morning("0 7 * * *") });

      const { code, io } = await routinesIn();

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Morning check   Daily at 08:00   Next tomorrow 08:00   Never ran",
        "! Morning check has changes that aren't live yet. It runs as last committed until you commit them or make them live in Halonic Studio.",
        hint,
      ]);
    },
    gitTimeout,
  );

  it(
    "says nothing when the routine is as committed, has no history, or was only turned off",
    async () => {
      await writeFiles(acmeRuns.acme, { [routinePath]: morning("0 8 * * *") });
      expect((await routinesIn()).io.stdout).not.toContainEqual(
        expect.stringContaining("aren't live yet"),
      );

      await makeLive();
      expect((await routinesIn()).io.stdout).not.toContainEqual(
        expect.stringContaining("aren't live yet"),
      );

      // Off counts at once, without a new version, so the routine stays live.
      await writeFiles(acmeRuns.acme, { [routinePath]: morning("0 8 * * *", "enabled: false\n") });
      expect((await routinesIn()).io.stdout).toEqual([
        "Morning check   Daily at 08:00   Off   Never ran",
        hint,
      ]);
    },
    gitTimeout,
  );

  it("still lists the routines when git can't start, and says it couldn't check what's live", async () => {
    await writeFiles(acmeRuns.acme, { [routinePath]: morning("0 8 * * *") });

    const { code, io } = await routinesIn(noGit);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Morning check   Daily at 08:00   Next tomorrow 08:00   Never ran",
      "! Couldn't check what's live: git can't start on this computer, so the live version can't be read. This list can't show which routines have changes that aren't live yet.",
      "Install git and make sure it's on your PATH, then try again.",
      hint,
    ]);
  });
});
