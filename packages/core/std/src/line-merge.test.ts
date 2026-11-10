import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { hasConflicts, mergedText, mergeLines } from "./line-merge.ts";

verifies("std.line-merge", () => {
  it("takes a change from each side when they don't touch", () => {
    const regions = mergeLines("a\nb\nc\n", "A\nb\nc\n", "a\nb\nC\n");
    expect(regions).toEqual([{ kind: "resolved", lines: ["A\n", "b\n", "C\n"] }]);
    expect(hasConflicts(regions)).toBe(false);
  });

  it("takes the same change on both sides once", () => {
    const regions = mergeLines("a\nb\nc\n", "a\nB\nc\n", "a\nB\nc\n");
    expect(mergedText(regions, "ours")).toBe("a\nB\nc\n");
    expect(hasConflicts(regions)).toBe(false);
  });

  it("gives the changed side when the other kept the base", () => {
    expect(mergedText(mergeLines("a\n", "a\nb\n", "a\n"), "theirs")).toBe("a\nb\n");
    expect(mergedText(mergeLines("a\n", "a\n", "a\nb\n"), "ours")).toBe("a\nb\n");
    expect(mergeLines("", "", "")).toEqual([]);
  });

  it("keeps lines removed on one side removed", () => {
    const merged = mergeLines("a\nb\nc\nd\n", "a\nc\nd\n", "a\nb\nc\nD\n");
    expect(mergedText(merged, "ours")).toBe("a\nc\nD\n");
    expect(hasConflicts(merged)).toBe(false);
  });
});

verifies("std.line-merge-conflict", () => {
  it("marks lines both sides changed differently as a conflict", () => {
    expect(mergeLines("a\nb\nc\n", "a\nX\nc\n", "a\nY\nc\n")).toEqual([
      { kind: "resolved", lines: ["a\n"] },
      { kind: "conflict", base: ["b\n"], ours: ["X\n"], theirs: ["Y\n"] },
      { kind: "resolved", lines: ["c\n"] },
    ]);
  });

  it("settles each conflict with the side it's told to take", () => {
    const regions = mergeLines("a\nb\nc\n", "a\nX\nc\n", "a\nY\nc\n");
    expect(mergedText(regions, "theirs")).toBe("a\nY\nc\n");
    expect(mergedText(regions, "ours")).toBe("a\nX\nc\n");
  });

  it("treats changes on lines next to each other as one conflict", () => {
    expect(mergeLines("a\nb\nc\n", "A\nb\nc\n", "a\nB\nc\n")).toEqual([
      { kind: "conflict", base: ["a\n", "b\n"], ours: ["A\n", "b\n"], theirs: ["a\n", "B\n"] },
      { kind: "resolved", lines: ["c\n"] },
    ]);
  });

  it("treats different lines added at the same place as a conflict", () => {
    expect(mergeLines("a\n", "a\nx\n", "a\ny\n")).toEqual([
      { kind: "resolved", lines: ["a\n"] },
      { kind: "conflict", base: [], ours: ["x\n"], theirs: ["y\n"] },
    ]);
  });

  it("groups a change on one side with two on the other that it bridges", () => {
    const regions = mergeLines("a\nb\nc\nd\n", "A\nb\nC\nd\n", "a\nB\nc\nd\n");
    expect(regions).toEqual([
      {
        kind: "conflict",
        base: ["a\n", "b\n", "c\n"],
        ours: ["A\n", "b\n", "C\n"],
        theirs: ["a\n", "B\n", "c\n"],
      },
      { kind: "resolved", lines: ["d\n"] },
    ]);
  });
});

// The option the assistant's baseline uses: changes that only touch are no conflict.
verifies("std.line-merge-conflict", () => {
  it("takes changes on both sides that only touch", () => {
    const regions = mergeLines("a\nb\nc\n", "A\nb\nc\n", "a\nB\nc\n", {
      touchingConflicts: false,
    });
    expect(regions).toEqual([{ kind: "resolved", lines: ["A\n", "B\n", "c\n"] }]);
    const after = mergeLines("a\nb\nc\n", "a\nB\nc\n", "a\nb\nnew\nc\n", {
      touchingConflicts: false,
    });
    expect(after).toEqual([{ kind: "resolved", lines: ["a\n", "B\n", "new\n", "c\n"] }]);
  });

  it("puts lines one side adds before lines the other side changed right after them", () => {
    const regions = mergeLines("a\nb\n", "a\nnew\nb\n", "a\nB\n", { touchingConflicts: false });
    expect(mergedText(regions, "ours")).toBe("a\nnew\nB\n");
    expect(hasConflicts(regions)).toBe(false);
    const swapped = mergeLines("a\nb\n", "a\nB\n", "a\nnew\nb\n", { touchingConflicts: false });
    expect(mergedText(swapped, "ours")).toBe("a\nnew\nB\n");
  });

  it("still marks overlapping changes and lines both add at the same place as conflicts", () => {
    const options = { touchingConflicts: false };
    expect(hasConflicts(mergeLines("a\nb\nc\n", "a\nX\nc\n", "a\nY\nc\n", options))).toBe(true);
    expect(hasConflicts(mergeLines("a\n", "a\nx\n", "a\ny\n", options))).toBe(true);
    expect(hasConflicts(mergeLines("a\nb\nc\n", "a\nc\n", "a\nb\nnew\nc\n", options))).toBe(false);
  });
});

describe("mergeLines for the assistant's baseline (HAL-3267, engine answer 1)", () => {
  // base = the file before a person's write, ours = the baseline, theirs = the file after the write.
  const beforeWrite = "name: Triage\nmodel: small\nsteps: 2\nnotes: none\n";
  const baseline = "name: Triage\nmodel: large\nsteps: 2\nnotes: none\n";

  it("keeps the assistant's change to review when the person types on the line after it", () => {
    // The assistant changed model: large to small; the person adds a line right after it.
    const afterWrite = "name: Triage\nmodel: small\ntemperature: 0\nsteps: 2\nnotes: none\n";
    const merged = mergeLines(beforeWrite, baseline, afterWrite, { touchingConflicts: false });
    expect(hasConflicts(merged)).toBe(false);
    expect(mergedText(merged, "theirs")).toBe(
      "name: Triage\nmodel: large\ntemperature: 0\nsteps: 2\nnotes: none\n",
    );
    // As git does it, the change is taken into the baseline, so nothing is left to review.
    expect(mergedText(mergeLines(beforeWrite, baseline, afterWrite), "theirs")).toBe(afterWrite);
  });

  it("carries an edit away from the assistant's change into the baseline", () => {
    const afterWrite = "name: Triage\nmodel: small\nsteps: 2\nnotes: see wiki\n";
    expect(mergedText(mergeLines(beforeWrite, baseline, afterWrite), "theirs")).toBe(
      "name: Triage\nmodel: large\nsteps: 2\nnotes: see wiki\n",
    );
  });

  it("gives the person's text where they edit inside the assistant's change", () => {
    const afterWrite = "name: Triage\nmodel: medium\nsteps: 2\nnotes: none\n";
    expect(mergedText(mergeLines(beforeWrite, baseline, afterWrite), "theirs")).toBe(afterWrite);
    const loose = mergeLines(beforeWrite, baseline, afterWrite, { touchingConflicts: false });
    expect(mergedText(loose, "theirs")).toBe(afterWrite);
  });
});
