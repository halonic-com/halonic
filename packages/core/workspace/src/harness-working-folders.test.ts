import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { harnessWorkingFolders } from "./harness-working-folders.ts";
import { loadWorkspace } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

/** The working folders of a workspace with these agent files, by path. */
async function foldersOf(agents: Readonly<Record<string, string>>): Promise<string[]> {
  const workspace = await loadWorkspace(
    new MemorySource({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      ...agents,
    }),
  );
  return harnessWorkingFolders(workspace);
}

verifies("workspace.harness-working-folders", () => {
  describe("harnessWorkingFolders", () => {
    it("lists each harness agent's folder, the default one too, in every hub, sorted", async () => {
      const folders = await foldersOf({
        "agents/coder.agent.yaml": "name: Coder\nharness: claude-code\nworkingFolder: scripts\n",
        "hubs/support/agents/writer.agent.yaml": "name: Writer\nharness: codex\n",
      });

      expect(folders).toEqual(["files/agents/writer", "scripts"]);
    });

    it("leaves out agents in Halonic's own loop", async () => {
      const folders = await foldersOf({
        "agents/sorter.agent.yaml": "name: Sorter\nworkingFolder: notes\n",
        "agents/helper.agent.yaml": "name: Helper\nharness: halonic\nworkingFolder: drafts\n",
      });

      expect(folders).toEqual([]);
    });

    it("names a folder two agents share once", async () => {
      const folders = await foldersOf({
        "agents/coder.agent.yaml": "name: Coder\nharness: claude-code\nworkingFolder: out\n",
        "agents/reviewer.agent.yaml": "name: Reviewer\nharness: codex\nworkingFolder: out\n",
      });

      expect(folders).toEqual(["out"]);
    });
  });
});
