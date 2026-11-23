// What `halonic run` says when Local only is on only because the saved
// workspace.yaml says on, before it's made live (C755 #1): the line about
// uncommitted changes names Local only as the one change it uses, and the
// refusal of a cloud model says where Local only comes from.

import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { turnOffLocalOnly } from "../../test/local-only.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { engineStart, testRunSetup } from "../../test/run-setup.ts";
import { type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { reviewedVersion } from "../trust/reviewed-version.ts";
import { runCommandWith } from "./command.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const samsEmail = ["--input", "examples/refund-question.json"];
const noCommands = { path: undefined, endings: [] };
/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let runner: GitRunner;

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-saved-local-only-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } };
  runner = await GitRunner.create({ git: await testGit() });
});

afterEach(async () => {
  await runner.close();
  await removeTestFolder(folder);
});

/**
 * Acme live with Local only off and its default model alias on a cloud model
 * at a port nothing listens on, so nothing could leave, and trusted as live.
 */
async function liveOnCloudModel(): Promise<OpenWorkspaceDir> {
  await turnOffLocalOnly(acme);
  await writeFile(
    join(acme, "providers/cloud.yaml"),
    "id: cloud\nname: Cloud model\ntype: openai-compatible\nbaseUrl: http://127.0.0.1:9/v1\n",
  );
  await writeFile(
    join(acme, "models.yaml"),
    "aliases:\n  default:\n    provider: cloud\n    model: small\n",
  );
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
  await vcs.init();
  await vcs.stage(await dir.store.list());
  await vcs.commit("First version");
  const { version } = await reviewedVersion(dir, history);
  const read = await readWorkspaceTrust(dir, noCommands, version);
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(engineStart));
  const check = await trust.check(read.subject);
  assertTrustable(check, read);
  expect((await trust.grant(read.subject, check.fingerprint, "cli")).ok).toBe(true);
  return dir;
}

/** Saves Local only on in `workspace.yaml` without committing it. */
async function saveLocalOnlyOn(): Promise<void> {
  const path = join(acme, "workspace.yaml");
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace("localOnly: false", "localOnly: true"));
}

async function run(): Promise<{ code: number; stdout: string[] }> {
  const io = captureIo(acme);
  const command = runCommandWith({ ...testRunSetup(folder, profile), history });
  const code = await runCli(["run", "support-reply", ...samsEmail], io, [command]);
  return { code, stdout: io.stdout };
}

verifies("app.saved-local-only", () => {
  it(
    "names Local only as the one uncommitted change used, and says the refusal comes from it",
    async () => {
      await liveOnCloudModel();
      await saveLocalOnlyOn();

      const { code, stdout } = await run();

      expect(code).toBe(exitCode.failed);
      expect(stdout[0]).toBe(
        "Your uncommitted changes aren't used, except Local only: your saved workspace.yaml turns it on, so this run uses local models only. Commit the changes to run them.",
      );
      expect(stdout).toContainEqual(
        expect.stringContaining(
          "Acme is local only in your saved workspace.yaml, which isn't live yet, so Halonic sent nothing to Cloud model.",
        ),
      );
      expect(stdout).toContainEqual(
        expect.stringContaining(
          "or set privacy.localOnly back to false in workspace.yaml: the live version has it off.",
        ),
      );
    },
    gitTimeout,
  );

  it(
    "says the run's usual lines once the saved file has Local only off again, as live",
    async () => {
      await liveOnCloudModel();
      await saveLocalOnlyOn();
      await turnOffSavedLocalOnly();

      const { stdout } = await run();

      const text = stdout.join("\n");
      expect(text).not.toContain("uncommitted");
      expect(text).not.toContain("local only");
      expect(text).toContain("couldn't reach Cloud model");
    },
    gitTimeout,
  );
});

/** Saves Local only off again, as the live version has it. */
async function turnOffSavedLocalOnly(): Promise<void> {
  const path = join(acme, "workspace.yaml");
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace("localOnly: true", "localOnly: false"));
}
