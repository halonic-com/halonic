import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { foldLabel, foldText, isFolded } from "./fold.ts";
import { markerText, markHidden } from "./hidden-characters.ts";

/** What the card shows for a value: its text with every marker written out. */
function shownText(value: string): string {
  return markHidden(value)
    .segments.map((segment) => (segment.kind === "text" ? segment.text : markerText(segment.code)))
    .join("");
}

verifies("inbox.plain-values", () => {
  describe("hidden characters", () => {
    it("marks a direction override and says so", () => {
      const marked = markHidden(`Refund${String.fromCodePoint(0x202e)}for Sam`);
      expect(marked.segments).toEqual([
        { kind: "text", text: "Refund" },
        { kind: "marker", code: "U+202E" },
        { kind: "text", text: "for Sam" },
      ]);
      expect(marked.hasHidden).toBe(true);
    });

    it.each([
      ["an isolate", String.fromCodePoint(0x2066), "U+2066"],
      ["a zero-width space", String.fromCodePoint(0x200b), "U+200B"],
      ["a word joiner", String.fromCodePoint(0x2060), "U+2060"],
      ["a byte order mark", String.fromCodePoint(0xfeff), "U+FEFF"],
      ["a tag character", "\u{E0041}", "U+E0041"],
      ["a control character", "\u0007", "U+0007"],
      ["a lone carriage return", "\r", "U+000D"],
      ["a C1 control character", "\u0085", "U+0085"],
    ])("marks %s", (_name, character, code) => {
      expect(shownText(`a${character}b`)).toBe(`a⟦${code}⟧b`);
    });

    it("keeps newlines, tabs and right-to-left text, and reads a Windows line end as a newline", () => {
      const marked = markHidden("one\ttwo\r\nשלום مرحبا");
      expect(marked.hasHidden).toBe(false);
      expect(shownText("one\ttwo\r\nשלום مرحبا")).toBe("one\ttwo\nשלום مرحبا");
    });

    it("keeps Markdown and HTML in model output exactly as written", () => {
      const reply =
        "[click](https://example.com) ![x](https://example.com/x.png) <script>alert(1)</script>";
      expect(markHidden(reply)).toEqual({
        segments: [{ kind: "text", text: reply }],
        hasHidden: false,
      });
    });
  });

  describe("folding", () => {
    it("folds after 6 lines and says how many are hidden", () => {
      const body = Array.from({ length: 44 }, (_, index) => `line ${index + 1}`).join("\n");
      const folded = foldText(body);
      expect(folded.shown.split("\n")).toHaveLength(6);
      expect(folded.full).toBe(body);
      expect(isFolded(folded)).toBe(true);
      expect(foldLabel(folded)).toBe("Show 38 more lines");
    });

    it("says one more line in the singular", () => {
      expect(foldLabel(foldText("a\nb", { lines: 1, characters: 100 }))).toBe("Show 1 more line");
    });

    it("doesn't fold a short value", () => {
      const folded = foldText("Hello, your refund is on its way.");
      expect(isFolded(folded)).toBe(false);
      expect(folded.shown).toBe(folded.full);
    });

    it("shortens more than 3 empty lines to one marker line, and keeps 3", () => {
      expect(foldText(`top${"\n".repeat(41)}bottom`).full).toBe("top\n⟦40 empty lines⟧\nbottom");
      expect(foldText("top\n\n\n\nbottom").full).toBe("top\n\n\n\nbottom");
    });

    it("cuts one very long line by characters, without splitting a character", () => {
      const folded = foldText(`${"a".repeat(9)}😀tail`, { lines: 6, characters: 10 });
      expect(folded.shown).toBe("a".repeat(9));
      expect(folded.hiddenLines).toBe(0);
      expect(foldLabel(folded)).toBe("Show 6 more characters");
    });

    it("says the size of a large value", () => {
      const folded = foldText("x".repeat(1024 * 1024));
      expect(folded.size).toBe("1.0 MB");
      expect(foldLabel(folded)).toBe("Show 1,046,576 more characters (1.0 MB)");
    });
  });
});
