import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { applyLineChanges, diffLines, splitLines } from "./line-diff.ts";

/** Pairs of texts every diff test also checks round-trip. */
const pairs: readonly (readonly [string, string])[] = [
  ["", ""],
  ["", "a\n"],
  ["a\n", ""],
  ["a\nb\nc\n", "a\nB\nc\n"],
  ["a\nb\n", "a\nx\nb\ny\n"],
  ["a\nb\nc\nd\ne\n", "b\nc\nX\ne\nf\n"],
  ["a\n", "a"],
  ["same\nsame\nsame\n", "same\nsame\n"],
  ["x\ny\nz", "z\ny\nx"],
];

describe("splitLines", () => {
  it("keeps each line's newline and a last line without one", () => {
    expect(splitLines("a\nb")).toEqual(["a\n", "b"]);
    expect(splitLines("a\n\nb\n")).toEqual(["a\n", "\n", "b\n"]);
    expect(splitLines("")).toEqual([]);
  });
});

verifies("std.line-diff", () => {
  it("gives one change for one changed line", () => {
    expect(diffLines("a\nb\nc\n", "a\nB\nc\n")).toEqual([
      { beforeStart: 1, beforeEnd: 2, afterStart: 1, removed: ["b\n"], added: ["B\n"] },
    ]);
  });

  it("gives an insertion as a change with no lines removed", () => {
    expect(diffLines("a\nb\n", "a\nx\nb\ny\n")).toEqual([
      { beforeStart: 1, beforeEnd: 1, afterStart: 1, removed: [], added: ["x\n"] },
      { beforeStart: 2, beforeEnd: 2, afterStart: 3, removed: [], added: ["y\n"] },
    ]);
  });

  it("gives a deletion as a change with no lines added", () => {
    expect(diffLines("a\nb\nc\n", "a\nc\n")).toEqual([
      { beforeStart: 1, beforeEnd: 2, afterStart: 1, removed: ["b\n"], added: [] },
    ]);
  });

  it("tells a last line with a newline from one without", () => {
    expect(diffLines("a\n", "a")).toEqual([
      { beforeStart: 0, beforeEnd: 1, afterStart: 0, removed: ["a\n"], added: ["a"] },
    ]);
  });

  it("gives no changes for the same text", () => {
    expect(diffLines("a\nb\n", "a\nb\n")).toEqual([]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("keeps a line between two changes, so changes never touch", () => {
    for (const [before, after] of pairs) {
      const changes = diffLines(before, after);
      for (let index = 1; index < changes.length; index++) {
        const previous = changes[index - 1];
        const current = changes[index];
        expect(current?.beforeStart).toBeGreaterThan(previous?.beforeEnd ?? 0);
      }
    }
  });

  it("finds a small edit in a long file", () => {
    const lines = Array.from({ length: 5000 }, (_, index) => `line ${index}\n`);
    const before = lines.join("");
    const after = [...lines.slice(0, 2500), "changed\n", ...lines.slice(2501)].join("");
    expect(diffLines(before, after)).toEqual([
      {
        beforeStart: 2500,
        beforeEnd: 2501,
        afterStart: 2500,
        removed: ["line 2500\n"],
        added: ["changed\n"],
      },
    ]);
  });

  it("gives a changed middle too large to compare as one change", () => {
    const before = "top\na\nb\nc\nbottom\n";
    const after = "top\nA\nb\nC\nbottom\n";
    // The changed middles are 3 lines each, so 9 pairs, one more than allowed.
    expect(diffLines(before, after, { maxComparedLinePairs: 8 })).toEqual([
      {
        beforeStart: 1,
        beforeEnd: 4,
        afterStart: 1,
        removed: ["a\n", "b\n", "c\n"],
        added: ["A\n", "b\n", "C\n"],
      },
    ]);
    expect(diffLines(before, after, { maxComparedLinePairs: 9 })).toHaveLength(2);
  });

  it("still applies a coarse diff", () => {
    const before = "a\nb\nc\n";
    const after = "A\nb\nC\n";
    const coarse = diffLines(before, after, { maxComparedLinePairs: 0 });
    expect(coarse).toHaveLength(1);
    expect(applyLineChanges(before, coarse)).toBe(after);
  });
});

verifies("std.line-diff-apply", () => {
  const before = "a\nb\nc\nd\n";
  const after = "A\nb\nc\nD\n";

  it("applies only the changes passed", () => {
    const changes = diffLines(before, after);
    expect(changes).toHaveLength(2);
    expect(applyLineChanges(before, changes.slice(1))).toBe("a\nb\nc\nD\n");
    expect(applyLineChanges(before, changes.slice(0, 1))).toBe("A\nb\nc\nd\n");
  });

  it("gives the text after for every change and the text before for none", () => {
    for (const [first, second] of pairs) {
      expect(applyLineChanges(first, diffLines(first, second))).toBe(second);
      expect(applyLineChanges(first, [])).toBe(first);
    }
  });

  it("takes the changes in any order", () => {
    const changes = diffLines(before, after);
    expect(applyLineChanges(before, [...changes].reverse())).toBe(after);
  });

  it("refuses changes that overlap or don't fit the text", () => {
    const [change] = diffLines(before, after);
    if (change === undefined) throw new Error("expected a change");
    expect(() => applyLineChanges(before, [change, change])).toThrow(/overlaps/);
    const [late] = diffLines("a\nb\nc\nd\ne\n", "a\nb\nc\nd\nE\n");
    if (late === undefined) throw new Error("expected a change");
    expect(() => applyLineChanges("a\n", [late])).toThrow(/isn't from this text/);
  });

  it("refuses a change whose removed lines aren't the text's lines at its place", () => {
    // A part of an older diff, clicked after the file changed.
    const [stale] = diffLines("x\ny\n", "x\nY\n");
    if (stale === undefined) throw new Error("expected a change");
    expect(() => applyLineChanges("p\nq\n", [stale])).toThrow(/isn't from this text/);
    const [insertion] = diffLines("a\n", "a\nb\n");
    if (insertion === undefined) throw new Error("expected a change");
    expect(applyLineChanges("a\n", [insertion])).toBe("a\nb\n");
    expect(() => applyLineChanges("", [insertion])).toThrow(/isn't from this text/);
  });
});
