import type { ListedToolReview, ReviewedTool } from "@halonicjs/app/listed-tools";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { listedToolsSnapshot } from "./listed-tools-snapshot.ts";

const emptyReview: ListedToolReview = {
  source: "notes",
  on: [],
  declared: [],
  toReview: [],
  refused: [],
  keepsChanging: [],
  listingRefused: null,
  unreadable: null,
};

function reviewedTool(
  overrides: Partial<ReviewedTool> & { serverChanged?: boolean },
): ReviewedTool {
  const { serverChanged = false, ...rest } = overrides;
  return {
    state: "changed",
    waiting: {
      listedName: "lookup",
      fingerprint: "htl1:abc",
      tool: {
        name: "notes__lookup",
        description: "Finds a note by title.",
        parameters: {
          type: "object",
          properties: { title: { type: "string", description: "The note's title" } },
        },
      },
      approved: null,
      serverChanged,
      keepsChanging: false,
    },
    changes: [],
    leftOutArguments: [],
    ...rest,
  };
}

describe("listedToolsSnapshot", () => {
  verifies("library.listed-tools-snapshot", () => {
    it("carries the approved and new text of a changed tool, with why it can't be seen", () => {
      const changes = [
        {
          path: "description",
          before: "Finds a note.",
          after: "Finds a nоte.",
          hidden: "lookalike",
        },
      ] as const;
      const snapshot = listedToolsSnapshot("Notes", {
        ...emptyReview,
        toReview: [reviewedTool({ changes })],
      });
      expect(snapshot.toReview[0]?.differences).toEqual(changes);
      expect(snapshot.toReview[0]?.arguments).toEqual([
        { name: "title", type: "string", description: "The note's title" },
      ]);
      expect(snapshot.hasApprovals).toBe(true);
    });

    it("carries a change made only of invisible characters as hidden: format", () => {
      const changes = [
        {
          path: "description",
          before: "Finds a note.",
          after: "Finds a\u200B note.",
          hidden: "format",
        },
      ] as const;
      const snapshot = listedToolsSnapshot("Notes", {
        ...emptyReview,
        toReview: [reviewedTool({ changes })],
      });
      expect(snapshot.toReview[0]?.differences[0]?.hidden).toBe("format");
    });

    it("gives a never-approved tool no differences and no approvals", () => {
      const snapshot = listedToolsSnapshot("Notes", {
        ...emptyReview,
        toReview: [reviewedTool({ state: "not_approved" })],
      });
      expect(snapshot.toReview[0]?.state).toBe("not_approved");
      expect(snapshot.toReview[0]?.differences).toEqual([]);
      expect(snapshot.hasApprovals).toBe(false);
    });

    it("marks a tool whose only change is its server", () => {
      const snapshot = listedToolsSnapshot("Notes", {
        ...emptyReview,
        toReview: [reviewedTool({ serverChanged: true })],
      });
      expect(snapshot.toReview[0]).toMatchObject({ serverChanged: true, differences: [] });
    });

    it("leaves the tool name out of an unreadable approval that doesn't name one", () => {
      const snapshot = listedToolsSnapshot("Notes", {
        ...emptyReview,
        unreadable: { toolName: null, error: new Error("bad") },
      });
      expect(snapshot.unreadable).toEqual({});
    });
  });
});
