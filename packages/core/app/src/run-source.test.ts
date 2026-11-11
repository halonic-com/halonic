import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { liveVersionOf } from "./live-version.ts";
import { type RunSource, type RunStartedBy, runSourceFor } from "./run-source.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestVersions } from "./testing/test-versions.ts";

const briefingPath = "agents/briefing.agent.yaml";
const briefing = (model: string) =>
  `id: briefing\nname: Briefing\nmodel: ${model}\ninstructions: Brief me.\n`;
const triagePath = "agents/triage.agent.yaml";
const triage = (instructions: string) =>
  `id: triage\nname: Triage\nmodel: fast\ninstructions: ${instructions}\n`;

/** Acme with "briefing" live on `model: fast`, then saved with `model: smart`. */
function acme() {
  const versions = new TestVersions();
  const files = { "workspace.yaml": "id: acme\nname: Acme\n", [briefingPath]: briefing("fast") };
  const commit = versions.commit(files);
  const saved = new TestDefinitionStore({ ...files, [briefingPath]: briefing("smart") });
  return { versions, commit, saved };
}

/** The model of agent `id` in the workspace the run source reads. */
async function modelIn(picked: RunSource, id: string): Promise<string | undefined> {
  if (picked.reads === "nothing-live") {
    throw new Error("Nothing is live.");
  }
  const workspace = await loadWorkspace(picked.source);
  return filesOf(workspace, "agent").find((file) => file.value.id === id)?.value.model;
}

verifies("app.runs-read-latest-version", () => {
  describe("runSourceFor", () => {
    const fromLiveVersion: readonly RunStartedBy[] = ["run", "routine", "trigger", "call"];

    it.each(fromLiveVersion)("reads the live version for a run started by %s", async (by) => {
      const { versions, commit, saved } = acme();
      const live = await liveVersionOf(versions);

      const picked = runSourceFor(by, { live, vcs: versions, saved });

      expect(picked).toMatchObject({ reads: "live-version", commit: commit.hash });
      expect(await modelIn(picked, "briefing")).toBe("fast");
    });

    it.each(["try-it", "test"] as const)("reads the saved files for %s", async (by) => {
      const { versions, saved } = acme();
      const live = await liveVersionOf(versions);

      const picked = runSourceFor(by, { live, vcs: versions, saved });

      expect(picked).toEqual({ reads: "saved-files", source: saved });
      expect(await modelIn(picked, "briefing")).toBe("smart");
    });

    it("runs the live version of an agent another one calls, though it has saved changes", async () => {
      const versions = new TestVersions();
      versions.commit({ [briefingPath]: briefing("fast"), [triagePath]: triage("Sort it.") });
      const saved = new TestDefinitionStore({
        [briefingPath]: briefing("fast"),
        [triagePath]: triage("Sort it by size."),
      });

      const picked = runSourceFor("routine", {
        live: await liveVersionOf(versions),
        vcs: versions,
        saved,
      });

      if (picked.reads === "nothing-live") throw new Error("Nothing is live.");
      expect(await picked.source.read(triagePath)).toBe(triage("Sort it."));
    });

    it("reads the saved files for every run with history off", async () => {
      const { versions, saved } = acme();
      versions.isRepo = false;
      const live = await liveVersionOf(versions);

      for (const by of fromLiveVersion) {
        expect(runSourceFor(by, { live, vcs: versions, saved })).toEqual({
          reads: "saved-files",
          source: saved,
        });
      }
    });

    it("has nothing live to run before the first version, but Try it reads the saved files", async () => {
      const versions = new TestVersions();
      const saved = new TestDefinitionStore({ [briefingPath]: briefing("smart") });
      const live = await liveVersionOf(versions);

      expect(runSourceFor("run", { live, vcs: versions, saved })).toEqual({
        reads: "nothing-live",
      });
      expect(runSourceFor("try-it", { live, vcs: versions, saved })).toMatchObject({
        reads: "saved-files",
      });
    });
  });
});

verifies("app.run-keeps-its-version", () => {
  it("keeps reading the version the run started with after a new one is made", async () => {
    const { versions, commit, saved } = acme();
    const picked = runSourceFor("run", {
      live: await liveVersionOf(versions),
      vcs: versions,
      saved,
    });

    versions.commit({ [briefingPath]: briefing("smart") });

    expect(await modelIn(picked, "briefing")).toBe("fast");
    if (picked.reads === "nothing-live") throw new Error("Nothing is live.");
    expect((await loadWorkspace(picked.source)).version).toBe(commit.hash);
  });

  it("records the saved files' own version for Try it", async () => {
    const { versions, saved } = acme();
    const picked = runSourceFor("try-it", {
      live: await liveVersionOf(versions),
      vcs: versions,
      saved,
    });

    if (picked.reads === "nothing-live") throw new Error("Nothing is live.");
    expect((await loadWorkspace(picked.source)).version).toBe(await saved.version());
  });
});
