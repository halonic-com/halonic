import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { suggestedVersionName, versionMessage } from "./version-name.ts";

verifies("source-control.create-version", () => {
  describe("suggestedVersionName", () => {
    it("names one, two or several items", () => {
      expect(suggestedVersionName(["agents/triage.agent.yaml"])).toBe("Changes to triage");
      expect(suggestedVersionName(["agents/triage.agent.yaml", "hubs/sales/hub.yaml"])).toBe(
        "Changes to triage and hub",
      );
      expect(suggestedVersionName(["a.md", "b.md", "c.md"])).toBe("Changes to 3 items");
    });

    it("counts two files of one item once, and reads a file with no kind by its name", () => {
      expect(suggestedVersionName(["skills/tone/SKILL.md", "skills/tone/notes.md"])).toBe(
        "Changes to SKILL and notes",
      );
      expect(suggestedVersionName(["README.md", "README.md"])).toBe("Changes to README");
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
