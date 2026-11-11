import { definitionSourceContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { filesOf, loadWorkspace, VersionSource } from "./index.ts";
import { MemoryVersions } from "./test/memory-versions.ts";

definitionSourceContract("VersionSource", async (files) => {
  const versions = new MemoryVersions();
  return new VersionSource(versions, versions.commit(files), "memory:acme");
});

const briefing = (model: string) =>
  `id: briefing\nname: Briefing\nmodel: ${model}\ninstructions: Brief me.\n`;

/** A workspace committed with agent "briefing" on `model: fast`. */
function committed() {
  const versions = new MemoryVersions();
  const commit = versions.commit({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "agents/briefing.agent.yaml": briefing("fast"),
  });
  return { versions, commit, source: new VersionSource(versions, commit, "memory:acme") };
}

verifies("workspace.definition-source-at-version", () => {
  describe("VersionSource", () => {
    it("loads an item as the version holds it", async () => {
      const { source, commit } = committed();

      const workspace = await loadWorkspace(source);

      expect(workspace.version).toBe(commit);
      expect(filesOf(workspace, "agent").map((file) => file.value.model)).toEqual(["fast"]);
    });

    it("reads only through the version, never another commit or the files on disk", async () => {
      const { versions, commit, source } = committed();
      versions.commit({ "agents/briefing.agent.yaml": briefing("smart") });

      expect(await source.read("agents/briefing.agent.yaml")).toBe(briefing("fast"));
      expect(await source.list("agents")).toEqual(["agents/briefing.agent.yaml"]);
      expect(versions.calls).toEqual([
        `read ${commit} agents/briefing.agent.yaml`,
        `list ${commit} agents`,
      ]);
    });

    it("finds no file the version doesn't have", async () => {
      const { source } = committed();

      expect(await source.read("workflows/intake.workflow.yaml")).toBeNull();
      expect(await source.list("workflows")).toEqual([]);
    });

    it("refuses a private path before it asks the version control", async () => {
      const { versions, source } = committed();

      await expect(source.read(".env")).rejects.toThrow(RangeError);
      await expect(source.list(".git")).rejects.toThrow(RangeError);
      expect(versions.calls).toEqual([]);
    });

    it("refuses a version that isn't a full commit id", () => {
      const { versions } = committed();

      expect(() => new VersionSource(versions, "HEAD", "memory:acme")).toThrow(RangeError);
      expect(() => new VersionSource(versions, "3f9a0c1", "memory:acme")).toThrow(RangeError);
    });
  });
});
