import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { noNewlineMarker, unifiedDiff } from "./diff-lines.ts";

const lines = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `line ${index + from}\n`).join("");

verifies("cli.commands.proposals.show", () => {
  describe("the unified diff", () => {
    it("shows a change with three lines of context, as git does", () => {
      const before = lines(10);
      const after = before.replace("line 5\n", "line five\n");

      expect(unifiedDiff(before, after)).toEqual([
        "@@ -2,7 +2,7 @@",
        " line 2",
        " line 3",
        " line 4",
        "-line 5",
        "+line five",
        " line 6",
        " line 7",
        " line 8",
      ]);
    });

    it("keeps changes far apart under headings of their own", () => {
      const before = lines(20);
      const after = before.replace("line 2\n", "line two\n").replace("line 18\n", "");

      expect(unifiedDiff(before, after).filter((line) => line.startsWith("@@"))).toEqual([
        "@@ -1,5 +1,5 @@",
        "@@ -15,6 +15,5 @@",
      ]);
    });

    it("adds every line of a new file, and removes every line of a deleted one", () => {
      expect(unifiedDiff(null, "a\nb\n")).toEqual(["@@ -0,0 +1,2 @@", "+a", "+b"]);
      expect(unifiedDiff("a\n", null)).toEqual(["@@ -1,1 +0,0 @@", "-a"]);
    });

    it("marks a last line with no newline as git does, so a change to only that is seen", () => {
      expect(unifiedDiff("a\nb", "a\nb\n")).toEqual([
        "@@ -1,2 +1,2 @@",
        " a",
        "-b",
        noNewlineMarker,
        "+b",
      ]);
      expect(unifiedDiff("a\nb\nc", "a\nB\nc")).toEqual([
        "@@ -1,3 +1,3 @@",
        " a",
        "-b",
        "+B",
        " c",
        noNewlineMarker,
      ]);
      expect(noNewlineMarker).toBe("\\ No newline at end of file");
    });

    it("is empty when the texts are the same", () => {
      expect(unifiedDiff("a\n", "a\n")).toEqual([]);
    });
  });
});
