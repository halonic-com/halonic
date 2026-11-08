import { describe, expect, it } from "vitest";
import { parseDiff } from "./git-changes.ts";

describe("parseDiff", () => {
  it("keeps only added lines, with their line numbers in the new file", () => {
    const diff = [
      ":100644 100644 1111111 2222222 M\tdocs/a b.md",
      ":000000 100644 0000000 e69de29 A\tapps/.env",
      ':000000 100644 0000000 3333333 A\t"docs/\\303\\251t\\303\\251.md"',
      "diff --git a/docs/a b.md b/docs/a b.md",
      "--- a/docs/a b.md\t",
      "+++ b/docs/a b.md\t",
      "@@ -3 +3,2 @@",
      "-old",
      "+new",
      "++ not a header",
      "@@ -10,0 +12 @@",
      "+later",
      'diff --git "a/docs/\\303\\251t\\303\\251.md" "b/docs/\\303\\251t\\303\\251.md"',
      "--- /dev/null",
      '+++ "b/docs/\\303\\251t\\303\\251.md"',
      "@@ -0,0 +1 @@",
      "+summer",
    ].join("\n");
    expect(parseDiff(diff)).toEqual([
      {
        path: "docs/a b.md",
        lines: [
          { number: 3, text: "new" },
          { number: 4, text: "+ not a header" },
          { number: 12, text: "later" },
        ],
      },
      { path: "apps/.env", lines: [] },
      { path: "docs/été.md", lines: [{ number: 1, text: "summer" }] },
    ]);
  });

  it("reads the combined diff of a merge, keeping what either side or the merge adds", () => {
    const diff = [
      "::100644 000000 100644 7898192 0000000 9d6934f MA\ta.txt",
      "diff --cc a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@@ -1,1 -1,0 +1,3 @@@",
      " +from the other side",
      "- gone in the merge",
      "++written in the merge",
      "  unchanged",
    ].join("\n");
    expect(parseDiff(diff)).toEqual([
      {
        path: "a.txt",
        lines: [
          { number: 1, text: "from the other side" },
          { number: 2, text: "written in the merge" },
        ],
      },
    ]);
  });
});
