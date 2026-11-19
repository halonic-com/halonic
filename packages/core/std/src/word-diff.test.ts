import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { diffWords, type WordPiece } from "./word-diff.ts";

/** The pieces as text, with the changed ones in brackets: "Use [Dutch]." */
function marked(pieces: readonly WordPiece[]): string {
  return pieces.map((piece) => (piece.changed ? `[${piece.text}]` : piece.text)).join("");
}

/** Pairs of texts every test also checks join back from their pieces. */
const pairs: readonly (readonly [string, string])[] = [
  ["", ""],
  ["", "Be kind."],
  ["Write short sentences.", "Write short, warm sentences."],
  ["Line one\nline two", "Line one\n\nline 2"],
  ["Café — naïve", "Cafe - naive"],
];

verifies("std.word-diff", () => {
  describe("diffWords", () => {
    it("marks only the words an edit added", () => {
      const diff = diffWords("Write short sentences.", "Write short, warm sentences.");
      expect(marked(diff.before)).toBe("Write short sentences.");
      expect(marked(diff.after)).toBe("Write short[, warm] sentences.");
    });

    it("marks a replaced word on both sides", () => {
      const diff = diffWords("Use English.", "Use Dutch.");
      expect(marked(diff.before)).toBe("Use [English].");
      expect(marked(diff.after)).toBe("Use [Dutch].");
    });

    it("leaves the spaces at the ends of a changed run unmarked", () => {
      const diff = diffWords("Be brief.", "Be very brief.");
      expect(marked(diff.after)).toBe("Be [very] brief.");
    });

    it("marks nothing in two texts that are the same", () => {
      const diff = diffWords("Be brief.", "Be brief.");
      expect(diff.before).toEqual([{ text: "Be brief.", changed: false }]);
      expect(diff.after).toEqual([{ text: "Be brief.", changed: false }]);
    });

    it("marks the whole of a text the other doesn't have", () => {
      const diff = diffWords("", "Be kind.");
      expect(diff.before).toEqual([]);
      expect(marked(diff.after)).toBe("[Be kind.]");
    });

    it.each(pairs)("joins the pieces back to both texts: %j → %j", (before, after) => {
      const diff = diffWords(before, after);
      expect(diff.before.map((piece) => piece.text).join("")).toBe(before);
      expect(diff.after.map((piece) => piece.text).join("")).toBe(after);
    });
  });
});
