// The versions the page's engine starts its runs from (HAL-14229): loaded once per commit, kept
// for a run until it ends, and no more than the latest commit and the running runs' ones.

import { MemoryVcs } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { acmeFiles } from "./engine-service.testing.ts";
import { PageRunVersions } from "./page-run-versions.ts";

const writerPath = "hubs/support/agents/writer.agent.yaml";
const reply = { hubId: "support", workflowId: "reply" };
const passes = async () => {};

/** Acme in a repository with one version; `commitNext` makes another with the writer renamed. */
async function acmeWithHistory() {
  const files = acmeFiles();
  const vcs = new MemoryVcs(files);
  await vcs.init();
  await vcs.stage((await files.list()) ?? []);
  const first = await vcs.commit("First version");
  return {
    files,
    vcs,
    first,
    commitNext: async (name: string) => {
      await files.write(writerPath, `id: writer\nname: ${name}\n`);
      await vcs.stage([writerPath]);
      return await vcs.commit(`Writer is ${name}`);
    },
  };
}

verifies("studio.engine-service", () => {
  it("keeps a run's load until it ends, then only the latest commit's", async () => {
    const { files, vcs, first, commitNext } = await acmeWithHistory();
    const versions = new PageRunVersions({ versions: vcs, saved: files, keepsRuns: true });

    const picked = await versions.pick();
    expect(picked.version).toMatchObject({ reads: "live-version", commit: first });
    await versions.definitionsOf({ ...reply, runId: "run_1" }, picked.version, passes);
    const second = await commitNext("Scribe");
    await versions.pick();

    expect(versions.keptCommits()).toEqual([first, second].sort());
    // The run's connectors and agents still read the version it started from.
    const { workspace, fileTexts } = await versions.loadedOf({ runId: "run_1", version: null });
    expect(filesOf(workspace, "agent")[0]?.value.name).toBe("Writer");
    expect(fileTexts.get(writerPath)).toBe("id: writer\nname: Writer\n");

    versions.forget("run_1");
    expect(versions.keptCommits()).toEqual([second]);
  });

  it("keeps nothing for a run when nothing forgets it", async () => {
    const { files, vcs, commitNext } = await acmeWithHistory();
    const versions = new PageRunVersions({ versions: vcs, saved: files, keepsRuns: false });
    const picked = await versions.pick();
    await versions.definitionsOf({ ...reply, runId: "run_1" }, picked.version, passes);
    const second = await commitNext("Scribe");
    await versions.pick();

    expect(versions.keptCommits()).toEqual([second]);
  });

  it("starts nothing from a version its check refuses", async () => {
    const { files, vcs } = await acmeWithHistory();
    const versions = new PageRunVersions({ versions: vcs, saved: files, keepsRuns: true });
    const { version } = await versions.pick();
    const refuse = async () => {
      throw new Error("Not trusted.");
    };

    await expect(
      versions.definitionsOf({ ...reply, runId: "run_1" }, version, refuse),
    ).rejects.toThrow("Not trusted.");
  });

  it("reads the saved files as they are now for a run of the saved files", async () => {
    const files = acmeFiles();
    const versions = new PageRunVersions({ saved: files, keepsRuns: true });
    const picked = await versions.pick();
    expect(picked.version).toEqual({ reads: "saved-files" });
    await files.write(writerPath, "id: writer\nname: Scribe\n");

    const now = await versions.workspaceAt({ reads: "saved-files" });
    expect(filesOf(now, "agent")[0]?.value.name).toBe("Scribe");
    expect(versions.keptCommits()).toEqual([]);
  });
});
