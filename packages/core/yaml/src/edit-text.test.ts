import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  aboveComments,
  alignComments,
  columnOf,
  defaultIndentStyle,
  entryEnd,
  insertLines,
  keepLineComment,
  keepsComments,
  lineEndingOf,
  lineStart,
  removeLines,
  renderAfterKey,
  renderFlow,
  renderItem,
  renderPair,
  renderScalar,
  replaceRange,
  startsItsLine,
} from "./edit-text.ts";

// Whole lines, each ending in a line break.
const lines = (...rows: string[]) => `${rows.join("\n")}\n`;

// The line arithmetic and rendering the splicer builds on, checked directly so
// each rule is pinned down on its own.

verifies("yaml.edit", () => {
  it("names the line ending of a text, or none when it mixes them", () => {
    expect(lineEndingOf("")).toBe("\n");
    expect(lineEndingOf("a")).toBe("\n");
    expect(lineEndingOf("a\nb\n")).toBe("\n");
    expect(lineEndingOf("a\r\nb\r\n")).toBe("\r\n");
    expect(lineEndingOf("a\rb")).toBeUndefined();
    expect(lineEndingOf("a\r\nb\n")).toBeUndefined();
  });

  it("finds where a line starts, leaving a byte order mark out of the first line", () => {
    expect(lineStart("ab\ncd", 4)).toBe(3);
    expect(lineStart("ab\ncd", 3)).toBe(3);
    expect(lineStart("ab\ncd", 1)).toBe(0);
    expect(lineStart("\uFEFFab", 2)).toBe(1);
    expect(lineStart("\uFEFFab\ncd", 5)).toBe(4);
    expect(lineStart("ab", 1)).toBe(0);
    expect(columnOf("ab\n  cd", 5)).toBe(2);
    expect(columnOf("\uFEFFab", 2)).toBe(1);
  });

  it("tells whether only spaces come before an offset on its line", () => {
    expect(startsItsLine("a: 1\n  b: 2", 7)).toBe(true);
    expect(startsItsLine("a: 1\n  b: 2", 9)).toBe(false);
    expect(startsItsLine("a: 1", 0)).toBe(true);
  });

  it("ends an entry after its line break, taking a trailing comment along", () => {
    expect(entryEnd("a: 1 # c\nb: 2\n", 4)).toBe(9);
    expect(entryEnd("a: 1", 4)).toBe(4);
    // A block collection already ends after its line break.
    expect(entryEnd(lines("a:", "  - 1", "b: 2"), 9)).toBe(9);
    // A value at the very start of the text is not one that ends in a line break.
    expect(entryEnd("\nb", 0)).toBe(1);
    expect(entryEnd("a", 0)).toBe(1);
  });

  it("moves up over the comment lines right above a line, and no further", () => {
    const text = "x: 0\n# one\n  # two\ny: 1\n";
    expect(aboveComments(text, 19)).toBe(5);
    expect(aboveComments("# top\ny: 1\n", 6)).toBe(0);
    expect(aboveComments("x: 0\ny: 1\n", 5)).toBe(5);
    expect(aboveComments("x: 0", 0)).toBe(0);
  });

  it("checks that every comment outside the removed range survives", () => {
    const before = "# a\nx: 1\n# b\ny: 2\n";
    expect(keepsComments(before, 4, 9, "# a\n# b\ny: 2\n")).toBe(true);
    expect(keepsComments(before, 4, 9, "# a\ny: 2\n")).toBe(false);
    // The comment inside the range may go.
    expect(keepsComments(before, 4, 14, "# a\ny: 2\n")).toBe(true);
    // A comment line that appears twice must stay twice.
    expect(keepsComments("# a\n# a\nx: 1\n", 8, 13, "# a\nx: 1\n")).toBe(false);
    expect(keepsComments("# a\n# a\nx: 1\n", 8, 13, "# a\n# a\n")).toBe(true);
    // Text that only holds the removed range loses nothing.
    expect(keepsComments("x: 1\n", 0, 5, "")).toBe(true);
  });

  it("removes lines, and one blank line when blanks sat on both sides", () => {
    expect(removeLines("a: 1\n\nb: 2\n\nc: 3\n", 6, 11)).toBe("a: 1\n\nc: 3\n");
    // A blank only above, or only below, stays.
    expect(removeLines("a: 1\n\nb: 2\nc: 3\n", 6, 11)).toBe("a: 1\n\nc: 3\n");
    expect(removeLines("a: 1\nb: 2\n\nc: 3\n", 5, 10)).toBe("a: 1\n\nc: 3\n");
    // The last entry takes the blank lines above it.
    expect(removeLines("a: 1\n\n\nb: 2\n", 7, 13)).toBe("a: 1\n");
    // The first entry takes the blank lines below it.
    expect(removeLines("a: 1\n\n\nb: 2\n", 0, 5)).toBe("b: 2\n");
    // A text that starts with a byte order mark keeps it.
    expect(removeLines("\uFEFFa: 1\n\nb: 2\n", 1, 6)).toBe("\uFEFFb: 2\n");
    // The first entry of a text with nothing blank below it.
    expect(removeLines("a: 1\nb: 2\nc: 3\n", 0, 5)).toBe("b: 2\nc: 3\n");
    // A middle entry whose neighbours are not both blank.
  });

  it("indents the comments left under a deleted block to the next entry", () => {
    const text = "a: 1\n    # kept\n      # deeper\nb: 2\n";
    expect(alignComments(text, 5, 0)).toBe("a: 1\n# kept\n# deeper\nb: 2\n");
    // A comment at the column already, or less indented, stays.
    expect(alignComments(lines("a:", "  # at", "  b: 1"), 3, 2)).toBe(
      lines("a:", "  # at", "  b: 1"),
    );
    expect(alignComments(lines("a:", "    # more", "  b: 1"), 3, 2)).toBe(
      lines("a:", "  # more", "  b: 1"),
    );
    expect(alignComments(lines("a:", "  # less", "    b: 1"), 3, 4)).toBe(
      lines("a:", "  # less", "    b: 1"),
    );
    // Blank lines between comments are skipped over.
    expect(alignComments("a: 1\n\n    # c\nb: 2\n", 5, 0)).toBe("a: 1\n\n# c\nb: 2\n");
    // Nothing follows: the text is left as it is.
    expect(alignComments("a: 1\n    # c\n", 5, 0)).toBe("a: 1\n    # c\n");
    // The next entry sits at another column.
    expect(alignComments("a: 1\n    # c\n  b: 2\n", 5, 0)).toBe("a: 1\n    # c\n  b: 2\n");
  });

  it("inserts whole lines, adding the missing final line break first", () => {
    expect(insertLines("a: 1\n", 5, "b: 2\n")).toBe("a: 1\nb: 2\n");
    expect(insertLines("a: 1", 4, "b: 2\n")).toBe("a: 1\nb: 2");
    expect(insertLines("a: 1\nc: 3\n", 5, "b: 2\n")).toBe("a: 1\nb: 2\nc: 3\n");
    expect(insertLines("", 0, "a: 1\n")).toBe("a: 1\n");
    // In the middle of a text without a final break nothing is added.
    expect(insertLines("a: 1\nc: 3", 5, "b: 2\n")).toBe("a: 1\nb: 2\nc: 3");
  });

  it("replaces a range, keeping a line break only where the old text had one", () => {
    expect(replaceRange("a: 1\nb: 2\n", 2, 5, " 9\n")).toBe("a: 9\nb: 2\n");
    expect(replaceRange("a: 1\nb: 2\n", 0, 5, "x: 0\n")).toBe("x: 0\nb: 2\n");
    expect(replaceRange("a: 1\nb: 2\n", 2, 4, " 9")).toBe("a: 9\nb: 2\n");
    expect(replaceRange("a: 1\nb: 2\n", 3, 4, "9\n")).toBe("a: 9\nb: 2\n");
    // An empty old range never takes the line break before it.
    expect(replaceRange("a\nb", 2, 2, "x")).toBe("a\nxb");
    expect(replaceRange("a\nb", 2, 2, "x\n")).toBe("a\nxb");
  });

  it("moves a comment on the replaced line onto the new text", () => {
    expect(keepLineComment("a: # about a\n  b: 1\n", 2, 20, "\n  c: 2\n")).toEqual({
      to: 20,
      rendered: " # about a\n  c: 2\n",
    });
    // The comment follows the dash of a list entry.
    expect(keepLineComment("- # first\n  a: 1\n", 1, 17, "\na: 2\n")).toEqual({
      to: 17,
      rendered: " # first\na: 2\n",
    });
    // And a block text header.
    expect(keepLineComment("a: | # note\n  text\n", 2, 18, "x")).toEqual({
      to: 18,
      rendered: "x # note",
    });
    expect(keepLineComment("a: |2 # note\n  text\n", 2, 19, "x")).toEqual({
      to: 19,
      rendered: "x # note",
    });
    // A comment at the end of a text with no line break.
    expect(keepLineComment("a: # c", 2, 3, "x")).toEqual({ to: 6, rendered: "x # c" });
    // The replaced text ending past the comment stays that far.
    expect(keepLineComment("a: # c\nb: 1\n", 2, 11, "x\ny")).toEqual({
      to: 11,
      rendered: "x # c\ny",
    });
    // Rendered text with a single line takes the comment at its end.
    expect(keepLineComment("a: # c\n", 2, 3, "one line")).toEqual({
      to: 6,
      rendered: "one line # c",
    });
    // No comment, or one that does not start the rest of the line: nothing moves.
    expect(keepLineComment("a: 1\n", 1, 4, "x")).toEqual({ to: 4, rendered: "x" });
    expect(keepLineComment("a: b # c\n", 2, 5, "x")).toEqual({ to: 5, rendered: "x" });
    // The comment has to be set off by a blank, and the line must start at `from`.
    expect(keepLineComment("a:#c\n", 2, 2, "x")).toEqual({ to: 2, rendered: "x" });
    expect(keepLineComment("zz: # c\n", 1, 2, "x")).toEqual({ to: 2, rendered: "x" });
    // A header that is not a block text header is not skipped over.
    expect(keepLineComment("a: ? # c\n", 2, 3, "x")).toEqual({ to: 3, rendered: "x" });
  });

  it("renders pairs, items and values after a key at the column asked for", () => {
    expect(renderPair("k", 1, 2, defaultIndentStyle)).toBe("  k: 1\n");
    expect(renderPair("k", [1, 2], 2, defaultIndentStyle)).toBe(
      lines("  k:", "    - 1", "    - 2"),
    );
    expect(renderPair("k", [1], 0, { indent: 4, indentSeq: true })).toBe(lines("k:", "    - 1"));
    expect(renderItem({ a: 1, b: 2 }, 2, defaultIndentStyle)).toBe("  - a: 1\n    b: 2\n");
    expect(renderAfterKey(1, 0, defaultIndentStyle)).toBe(": 1\n");
    expect(renderAfterKey({ a: 1 }, 2, defaultIndentStyle)).toBe(":\n    a: 1\n");
  });

  it("folds long text to the width left after the column, never under 40", () => {
    const words = Array.from({ length: 30 }, () => "word").join(" ");
    const lengths = (column: number) =>
      renderPair("k", words, column, defaultIndentStyle)
        .split("\n")
        .map((line) => line.length);
    // Column 0: folded at 100, so the first line is nearly that wide.
    const flat = lengths(0);
    expect(flat.length).toBeGreaterThan(2);
    expect(Math.max(...flat)).toBeLessThanOrEqual(100);
    expect(flat[0]).toBeGreaterThan(90);
    // Column 70: 30 left, so the floor of 40 applies on top of the indent.
    const mid = lengths(70);
    expect(mid.length).toBeGreaterThan(3);
    expect(Math.max(...mid)).toBeLessThanOrEqual(70 + 40);
    expect(mid[0]).toBeGreaterThan(70 + 30);
  });

  it("renders a flow collection on one line, or none when it needs more", () => {
    expect(renderFlow([1, 2], false)).toBe("[1, 2]");
    expect(renderFlow([1, 2], true)).toBe("[ 1, 2 ]");
    expect(renderFlow({ a: 1 }, false)).toBe("{a: 1}");
    expect(renderFlow(["a\nb"], false)).toBeUndefined();
    const long = Array.from({ length: 80 }, (_, index) => `item${index}`);
    expect(renderFlow(long, false)).toBe(`[${long.join(", ")}]`);
  });

  it("renders a scalar on one line, keeping the quotes it had", () => {
    expect(renderScalar("x", undefined, 0)).toBe("x");
    expect(renderScalar("x", "QUOTE_DOUBLE", 0)).toBe('"x"');
    expect(renderScalar("x", "QUOTE_SINGLE", 0)).toBe("'x'");
    expect(renderScalar("x", "PLAIN", 0)).toBe("x");
    expect(renderScalar("x", "BLOCK_LITERAL", 0)).toBe("x");
    expect(renderScalar(5, "QUOTE_DOUBLE", 0)).toBe("5");
    expect(renderScalar(true, "QUOTE_SINGLE", 0)).toBe("true");
    expect(renderScalar("a\nb", undefined, 0)).toBeUndefined();
    expect(renderScalar("a b ".repeat(40).trim(), undefined, 0)).toBeUndefined();
  });
});
