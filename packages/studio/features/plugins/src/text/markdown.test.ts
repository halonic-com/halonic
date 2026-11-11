import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { readInline, readMarkdown } from "./markdown.ts";

const text = (value: string) => ({ kind: "text", text: value });

/** About 100 KB of `piece`, repeated. */
const long = (piece: string) => piece.repeat(Math.ceil(100_000 / piece.length));

/**
 * How many characters `read` lets regular expressions look at: from where each
 * search starts to the end of its match, or to the end of the text when it finds
 * nothing. It counts steps, not time, so a busy machine can't fail it.
 */
function charactersSearched(read: () => void): number {
  const exec = RegExp.prototype.exec;
  let searched = 0;
  const spy = vi.spyOn(RegExp.prototype, "exec").mockImplementation(function (
    this: RegExp,
    input: string,
  ) {
    const from = this.global || this.sticky ? this.lastIndex : 0;
    const match = exec.call(this, input);
    searched += (match === null ? input.length : match.index + match[0].length) - from;
    return match;
  });
  try {
    read();
  } finally {
    spy.mockRestore();
  }
  return searched;
}

verifies("plugins.plugin-text", () => {
  describe("readMarkdown", () => {
    it("reads headings, paragraphs, lists, quotes and code", () => {
      const source = [
        "# Today",
        "Sunny",
        "all day",
        "",
        "- one",
        "- two",
        "  more",
        "1. first",
        "> said",
        "```",
        "<b>raw</b>",
        "```",
      ].join("\n");
      expect(readMarkdown(source)).toEqual([
        { kind: "heading", inlines: [text("Today")] },
        { kind: "paragraph", inlines: [text("Sunny\nall day")] },
        {
          kind: "list",
          ordered: false,
          items: [[text("one")], [text("two\nmore")], [text("first")]],
        },
        { kind: "quote", inlines: [text("said")] },
        { kind: "code", text: "<b>raw</b>" },
      ]);
    });

    it("reads a numbered list and a fence with no end", () => {
      expect(readMarkdown("1) a\r\n2) b\r\n~~~\ncode")).toEqual([
        { kind: "list", ordered: true, items: [[text("a")], [text("b")]] },
        { kind: "code", text: "code" },
      ]);
    });

    it("ends a paragraph at a list, and a quote at a line that isn't one", () => {
      expect(readMarkdown("intro\n- item\n> q\nafter").map((block) => block.kind)).toEqual([
        "paragraph",
        "list",
        "quote",
        "paragraph",
      ]);
    });

    it("ends a paragraph only at a list that starts at 1", () => {
      expect(readMarkdown("In\n2024. Next\n1. one")).toEqual([
        { kind: "paragraph", inlines: [text("In\n2024. Next")] },
        { kind: "list", ordered: true, items: [[text("one")]] },
      ]);
    });

    it("gives no blocks for empty text", () => {
      expect(readMarkdown(" \n\n")).toEqual([]);
    });
  });

  describe("readInline", () => {
    it("reads code, strong, emphasis and web links", () => {
      expect(readInline("`x` **b** *i* _j_ [map](https://example.com/m)")).toEqual([
        { kind: "code", text: "x" },
        text(" "),
        { kind: "strong", children: [text("b")] },
        text(" "),
        { kind: "em", children: [text("i")] },
        text(" "),
        { kind: "em", children: [text("j")] },
        text(" "),
        { kind: "link", href: "https://example.com/m", text: "map" },
      ]);
    });

    it.each([
      ["a link to script", "[link](javascript:alert(1))"],
      ["a link to a file", "[f](file:///etc/passwd)"],
      ["a relative link", "[f](/settings)"],
      ["an image", "![x](https://example.com/x.png)"],
      ["HTML", "<b>bold</b> <script>alert(1)</script>"],
      ["a name with underscores", "snake_case_name"],
      ["sums", "2*3*4"],
    ])("keeps %s as text", (_name, source) => {
      expect(readInline(source)).toEqual([text(source)]);
    });

    it("keeps an escaped star as a star", () => {
      expect(readInline("\\*not em\\*")).toEqual([text("*not em*")]);
    });

    it("keeps a run of backticks with no matching run as text", () => {
      expect(readInline("``a` b `c`")).toEqual([
        text("``a"),
        { kind: "code", text: " b " },
        text("c`"),
      ]);
    });

    it("nests emphasis in strong and reads a link after an image", () => {
      expect(readInline("**a *b* c** ![i](x) [l](https://example.com)")).toEqual([
        {
          kind: "strong",
          children: [text("a "), { kind: "em", children: [text("b")] }, text(" c")],
        },
        text(" ![i](x) "),
        { kind: "link", href: "https://example.com", text: "l" },
      ]);
    });
  });

  // HAL-4978: markers that never close made every one of them search to the end.
  describe("a 100 KB answer", () => {
    it.each([
      ["stars that never close", long(" *a")],
      ["underscores that never close", long(" _a")],
      ["double stars that never close", long(" **a")],
      ["double underscores that never close", long(" __a")],
      ["every kind of emphasis, mixed", long(" *a **b _c __d")],
      [
        "backticks of many lengths",
        Array.from({ length: 440 }, (_, n) => `${"`".repeat(n + 1)}a`).join(""),
      ],
      ["brackets that never close", long("[a ")],
      ["images that never close", long("![a ")],
      ["addresses that never close", long("[a](b")],
      ["plain words", long("some plain words ")],
      ["emphasis that closes", long("*a* **b** _c_ `d` ")],
    ])("is read in steps that grow with its length: %s", (_name, source) => {
      const searched = charactersSearched(() => readMarkdown(source));
      expect(searched).toBeLessThan(source.length * 20);
    });
  });
});
