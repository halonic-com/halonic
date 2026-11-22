import { mkdtempSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { runCommandWith } from "./command.ts";

// C666 #2 (HAL-16057): `run` reads the live version and `validate` the saved
// files, so a fix that is saved but not committed made `run` point to a
// `validate` that found nothing.

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const samsEmail = ["--input", "examples/refund-question.json"];
/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let runner: GitRunner;
let vcs: GitVcs;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-fix-not-live-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: mkdtempSync(join(folder, "profile-")) },
  };
  runner = await GitRunner.create({ git: await testGit() });
  vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
});

afterEach(async () => {
  await runner.close();
  await removeTestFolder(folder);
});

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

/** Commits every file in the workspace folder, so it is the live version. */
async function commitAll(): Promise<void> {
  // Listed before git makes its own folder.
  const entries = await readdir(acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  await vcs.init();
  await vcs.stage(files);
  await vcs.commit("A version");
}

/** Points the default model alias at `provider` in `models.yaml`, and returns the file as it was. */
async function aliasProvider(provider: string): Promise<string> {
  const path = join(acme, "models.yaml");
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace("provider: mock", `provider: ${provider}`));
  return text;
}

async function run(): Promise<{ code: number; stderr: string[] }> {
  const io = captureIo(acme);
  const command = runCommandWith({ ...testRunSetup(folder, profile), history });
  const code = await runCli(["run", "support-reply", ...samsEmail], io, [command]);
  return { code, stderr: io.stderr };
}

verifies("cli.workspace-file-problems", () => {
  it(
    "says the fix isn't live yet when the saved files have none of the live version's errors",
    async () => {
      const fixed = await aliasProvider("mocky");
      await commitAll();
      await writeFile(join(acme, "models.yaml"), fixed);

      const { code, stderr } = await run();

      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ Couldn't run support-reply: Acme's last commit has 1 problem in models.yaml, and its fix isn't live yet. Nothing ran.",
        "  Commit the fix or make it live in Halonic Studio, then try again.",
      ]);
    },
    gitTimeout,
  );

  it(
    "points to validate while the saved files still have an error",
    async () => {
      await aliasProvider("mocky");
      await commitAll();
      await aliasProvider("mockz");

      const { code, stderr } = await run();

      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ Couldn't run support-reply: Acme has 1 problem in models.yaml. Nothing ran.",
        "  See it with: halonic validate",
      ]);
    },
    gitTimeout,
  );
});
