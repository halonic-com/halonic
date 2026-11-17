import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { groupIntoItems } from "./change-items.ts";
import type { ChangedFile } from "./changes-list-state.ts";

function changed(path: string, sentence: string, from?: string): ChangedFile {
  return {
    path,
    ...(from === undefined ? {} : { from }),
    texts: undefined,
    description: {
      path,
      kind: undefined,
      described: false,
      lines: [{ id: "item", sentence, parts: [] }],
    },
  };
}

verifies("source-control.changes-page", () => {
  describe("groupIntoItems", () => {
    it("makes one item of the files of one skill, named by the skill and with no path", () => {
      const items = groupIntoItems([
        changed("library/skills/triage/SKILL.md", "Changed"),
        changed("library/skills/triage/checklist.md", "New"),
      ]);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ name: "triage", kind: "skill", sentence: "Changed" });
      expect(items[0]?.files).toHaveLength(2);
    });

    it("keeps the same skill in two hubs as two items", () => {
      const items = groupIntoItems([
        changed("library/skills/triage/SKILL.md", "Changed"),
        changed("hubs/sales/library/skills/triage/SKILL.md", "Changed"),
      ]);
      expect(items).toHaveLength(2);
    });

    it("gives the files no kind places their own row, with a friendly name for the workspace's", () => {
      const items = groupIntoItems([
        changed("workspace.yaml", "Changed"),
        changed("models.yaml", "Changed"),
        changed("notes/README.md", "New"),
      ]);
      expect(items.map((item) => [item.name, item.kind])).toEqual([
        ["Workspace settings", undefined],
        ["Models", undefined],
        ["README.md", undefined],
      ]);
    });

    it("says Renamed from the old name for a moved item", () => {
      const [item] = groupIntoItems([
        changed("agents/help.agent.yaml", "Changed", "agents/support.agent.yaml"),
      ]);
      expect(item).toMatchObject({ name: "help", kind: "agent", sentence: "Renamed from support" });
    });
  });
});
