import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ChangedFile } from "./changes-list-state.ts";
import { suggestedVersionName, versionMessage } from "./version-name.ts";

verifies("source-control.create-version", () => {
  const changed = (path: string): ChangedFile => ({
    path,
    texts: undefined,
    description: {
      path,
      kind: undefined,
      described: false,
      lines: [{ id: "item", sentence: "Changed", parts: [] }],
    },
  });
  const named = (...paths: string[]) => suggestedVersionName(paths.map(changed), { first: false });

  describe("suggestedVersionName", () => {
    it("names one, two or several items", () => {
      expect(named("agents/triage.agent.yaml")).toBe("Changes to triage");
      expect(named("agents/triage.agent.yaml", "agents/sorter.agent.yaml")).toBe(
        "Changes to triage and sorter",
      );
      expect(named("a.md", "b.md", "c.md")).toBe("Changes to 3 items");
    });

    it("counts the items the page counts: files of one item once, same names apart", () => {
      expect(named("library/skills/tone/SKILL.md", "library/skills/tone/notes.md")).toBe(
        "Changes to tone",
      );
      expect(named("agents/a.agent.yaml", "workflows/a.workflow.yaml", "b.md", "c.md")).toBe(
        "Changes to 4 items",
      );
    });

    it("is First version for the first version", () => {
      expect(suggestedVersionName([changed("README.md")], { first: true })).toBe("First version");
    });
  });

  describe("versionMessage", () => {
    it("puts the notes after an empty line, and keeps the name on one line", () => {
      expect(versionMessage(" First\nreply ", " Tone changed. ")).toBe(
        "First reply\n\nTone changed.",
      );
      expect(versionMessage("First reply", "  ")).toBe("First reply");
    });
  });
});
