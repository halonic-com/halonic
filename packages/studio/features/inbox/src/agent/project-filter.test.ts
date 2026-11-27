import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentItemShows, projectChips, shownFilter } from "./project-filter.ts";

const item = (project?: { id: string; name: string }) => ({
  id: "i1",
  source: "s1",
  from: { kind: "me" as const },
  question: "Ship it?",
  options: [],
  attachments: [],
  createdAt: "2026-11-24T10:00:00.000Z",
  state: { kind: "open" as const },
  ...(project === undefined ? {} : { project }),
});

verifies("inbox.project-filter", () => {
  describe("the project filter", () => {
    it("falls back to all once the picked project has nothing waiting", () => {
      const chips = projectChips([item({ id: "p-web", name: "Website" })], 0);
      expect(chips.map((chip) => chip.label)).toEqual(["All projects", "Website"]);
      expect(shownFilter("project:p-web", chips)).toBe("project:p-web");
      expect(shownFilter("project:p-gone", chips)).toBe("all");
      expect(shownFilter("none", chips)).toBe("all");
    });

    it("never puts an item with no project under a project", () => {
      expect(agentItemShows(item(), "project:undefined")).toBe(false);
      expect(agentItemShows(item(), "none")).toBe(true);
    });
  });
});
