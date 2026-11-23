import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { DefinitionStore } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openGitHistory } from "../../run-workspace.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { WatchedVersions } from "./watch-versions.ts";

// The refusals of the versions a run reads in `routines watch`, in the CLI's
// words. What each version passes, and when, is tested with the code in
// the workspace engine (HAL-17054).

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;
let versions: WatchedVersions | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-watch-versions-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await versions?.close();
  versions = undefined;
  await removeTestFolder(folder);
});

/** The watch's versions of Acme with history off: the saved files. */
async function watchAcme(): Promise<WatchedVersions> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  versions = await WatchedVersions.open(dir, async () => null);
  return versions;
}

/** Commits every file in the workspace as a new version and gives its commit. */
async function commitAll(vcs: GitVcs, store: DefinitionStore): Promise<string> {
  await vcs.stage(await store.list());
  return await vcs.commit("A version");
}

/** This test starts a real git repository and commits twice, which can take longer than 5 s on a busy runner. */
const slowTest = { timeout: 60_000 };

/** A run that read the saved files. */
const savedRun = { runId: "run-1", version: { reads: "saved-files" } } as const;

verifies("cli.local-engine", () => {
  it("refuses a run's version that turns local only off, before its trust check", async () => {
    const watched = await watchAcme();
    let checks = 0;
    watched.checkWith({
      trust: async () => {
        checks += 1;
        return contractGrant;
      },
      sandbox: async () => {},
    });
    const file = join(acme, "workspace.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("localOnly: true", "localOnly: false"),
    );

    await expect(watched.trustedVersionOf(savedRun)).rejects.toThrow("turns local only on or off");
    expect(checks).toBe(0);
  });

  it("words a skill the version doesn't have", async () => {
    const watched = await watchAcme();
    await expect(watched.skillTextOf(savedRun, "support", "missing")).rejects.toThrow(
      "has no skill missing",
    );
  });
  it(
    "gives a child run's agent file from its own version, after a newer one was read",
    slowTest,
    async () => {
      const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
      const git = await testGit();
      const vcs = new GitVcs(acme, {
        runner: await GitRunner.create({ git }),
        author: { name: "Test", email: "test@example.com" },
      });
      await vcs.init();
      const agent = filesOf(await loadWorkspace(dir.store), "agent")[0];
      if (agent === undefined) throw new Error("Acme has no agent.");
      const first = await commitAll(vcs, dir.store);
      const firstText = await readFile(join(acme, agent.path), "utf8");
      versions = await WatchedVersions.open(dir, (root) => openGitHistory(root, { git }));
      // A newer version is made and read by another run, so `latest` is no longer the first one.
      await writeFile(join(acme, agent.path), `${firstText}# second version\n`);
      const second = await commitAll(vcs, dir.store);
      await versions.definitionsOf(
        "support",
        "support-reply",
        { reads: "live-version", commit: second, versionDate: "2026-11-10T09:42:00+01:00" },
        "run-2",
      );

      // The child run was never started by `definitionsOf`: it names its parent's version.
      const bytes = await versions.agentFileOf(
        {
          runId: "child-of-run-1",
          version: {
            reads: "live-version",
            commit: first,
            versionDate: "2026-11-10T09:42:00+01:00",
          },
        },
        agent.hub ?? "",
        agent.value.id,
      );

      expect(new TextDecoder().decode(bytes)).toBe(firstText);
      await expect(
        versions.agentFileOf(
          { runId: "child-of-run-1", version: null },
          agent.hub ?? "",
          agent.value.id,
        ),
      ).rejects.toThrow("doesn't name the version");
    },
  );
});
