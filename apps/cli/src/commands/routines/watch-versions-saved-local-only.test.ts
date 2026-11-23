// `routines watch` and `serve` count Local only as on once it's saved on,
// before it's made live, as the Studio does (HAL-16406, `app.saved-local-only`).

import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { trustContentInputOf } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openGitHistory } from "../../run-workspace.ts";
import { turnOffLocalOnly } from "../../test/local-only.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import type { WorkspaceAtVersion } from "../../workspace-at-version.ts";
import { type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { WatchedVersions } from "./watch-versions.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
/** Each test starts a real git repository, which can take longer than 5 s on a busy runner. */
const slowTest = { timeout: 60_000 };
const refusal =
  "Your saved workspace.yaml turns local only on. It isn't live yet, but it counts, and a running watch can't change local only. Stop the watch and start it again to run it.";

let folder: string;
let acme: string;
let runner: GitRunner;
let versions: WatchedVersions | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-watch-saved-local-only-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  // Live with Local only off, as a workspace that calls models in the cloud.
  await turnOffLocalOnly(acme);
});

afterEach(async () => {
  await versions?.close();
  versions = undefined;
  await runner?.close();
  await removeTestFolder(folder);
});

/** Acme under git with its files committed: the live version, which a routine run records. */
async function committedAcme(): Promise<{ dir: OpenWorkspaceDir; live: RunVersion }> {
  runner = await GitRunner.create({ git: await testGit() });
  const vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
  await vcs.init();
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  await vcs.stage(await dir.store.list());
  const commit = await vcs.commit("A version");
  return { dir, live: { reads: "live-version", commit, versionDate: "2026-11-23T05:00:00Z" } };
}

/** Opens the watch's versions of `dir`, checking trust with `trust`. */
async function watch(
  dir: OpenWorkspaceDir,
  trust: (version: WorkspaceAtVersion) => void = () => {},
): Promise<WatchedVersions> {
  const git = await testGit();
  versions = await WatchedVersions.open(dir, (root) => openGitHistory(root, { git }));
  versions.checkWith({
    trust: async (version) => {
      trust(version);
      return contractGrant;
    },
    sandbox: async () => {},
  });
  return versions;
}

/** Saves `workspace.yaml` with Local only on, without making it live. */
async function saveLocalOnlyOn(): Promise<void> {
  const file = join(acme, "workspace.yaml");
  const text = await readFile(file, "utf8");
  await writeFile(file, text.replace("localOnly: false", "localOnly: true"));
}

/** Saves `workspace.yaml` with Local only off again, as the live version has it. */
async function saveLocalOnlyOff(): Promise<void> {
  const file = join(acme, "workspace.yaml");
  const text = await readFile(file, "utf8");
  await writeFile(file, text.replace("localOnly: true", "localOnly: false"));
}

/** Whether `workspace` is local only, as the engine reads it. */
function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}

verifies("app.saved-local-only", () => {
  it("starts the watch local only when Local only is saved on before it", slowTest, async () => {
    const { dir, live } = await committedAcme();
    await saveLocalOnlyOn();

    const watched = await watch(dir);

    expect(isLocalOnly(watched.latest())).toBe(true);
    await watched.definitionsOf("support", "support-reply", live, "run-1");
    const now = await watched.trustedLive();
    expect(now === null ? null : isLocalOnly(now)).toBe(true);
  });

  it(
    "refuses the next routine run once Local only is saved on during the watch",
    slowTest,
    async () => {
      const { dir, live } = await committedAcme();
      const watched = await watch(dir);
      expect(isLocalOnly(watched.latest())).toBe(false);

      await saveLocalOnlyOn();

      await expect(
        watched.definitionsOf("support", "support-reply", live, "run-1"),
      ).rejects.toThrow(refusal);
      expect(await watched.trustedLive()).toBeNull();
    },
  );

  it(
    "refuses the next routine run once Local only is saved off again during the watch",
    slowTest,
    async () => {
      const { dir, live } = await committedAcme();
      await saveLocalOnlyOn();
      const watched = await watch(dir);
      await saveLocalOnlyOff();

      await expect(
        watched.definitionsOf("support", "support-reply", live, "run-1"),
      ).rejects.toThrow(
        "Your saved workspace.yaml turns local only off again, and a running watch can't change local only.",
      );
    },
  );

  it("refuses the connectors of a run that started before the save", slowTest, async () => {
    const { dir, live } = await committedAcme();
    const watched = await watch(dir);
    await watched.definitionsOf("support", "support-reply", live, "run-1");

    await saveLocalOnlyOn();

    const run = { runId: "run-1", version: live };
    await expect(watched.trustedVersionOf(run)).rejects.toThrow(refusal);
    // A run of the version that the watch didn't start is refused too.
    await expect(watched.trustedVersionOf({ ...run, runId: "older" })).rejects.toThrow(refusal);
  });

  it(
    "checks trust on the committed files, which the saved Local only doesn't change",
    slowTest,
    async () => {
      const { dir, live } = await committedAcme();
      const checked: unknown[] = [];
      const committed = await watch(dir, (version) => {
        checked.push(trustContentInputOf(version.workspace, version.integrations));
      });
      await committed.definitionsOf("support", "support-reply", live, "run-1");
      await committed.close();
      await saveLocalOnlyOn();

      const watched = await watch(dir, (version) => {
        checked.push(trustContentInputOf(version.workspace, version.integrations));
      });
      await watched.definitionsOf("support", "support-reply", live, "run-2");

      expect(isLocalOnly(watched.latest())).toBe(true);
      expect(checked).toHaveLength(2);
      expect(checked[1]).toEqual(checked[0]);
    },
  );
});
