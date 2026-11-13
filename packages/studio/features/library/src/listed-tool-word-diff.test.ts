import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { wordDiff } from "./listed-tool-word-diff.ts";

describe("wordDiff", () => {
  verifies("library.listed-tools-changed-columns", () => {
    it("marks the words taken out and the words put in, and keeps the rest", () => {
      expect(wordDiff("Finds notes by title.", "Finds notes by title or tag.")).toEqual([
        { kind: "same", text: "Finds notes by " },
        { kind: "removed", text: "title." },
        { kind: "added", text: "title or tag." },
      ]);
    });

    it("joins back into both texts", () => {
      const pieces = wordDiff("a b  c", "a c d");
      expect(
        pieces
          .filter((piece) => piece.kind !== "added")
          .map((piece) => piece.text)
          .join(""),
      ).toBe("a b  c");
      expect(
        pieces
          .filter((piece) => piece.kind !== "removed")
          .map((piece) => piece.text)
          .join(""),
      ).toBe("a c d");
    });

    it("handles an empty side", () => {
      expect(wordDiff("", "new")).toEqual([{ kind: "added", text: "new" }]);
      expect(wordDiff("old", "")).toEqual([{ kind: "removed", text: "old" }]);
    });

    it("shows two very long texts whole instead of comparing them word by word", () => {
      const long = (word: string) => Array.from({ length: 2000 }, () => word).join(" ");
      expect(wordDiff(long("a"), long("b"))).toEqual([
        { kind: "removed", text: long("a") },
        { kind: "added", text: long("b") },
      ]);
    });
  });
});
