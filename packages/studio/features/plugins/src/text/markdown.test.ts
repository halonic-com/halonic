import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readInline, readMarkdown } from "./markdown.ts";

const text = (value: string) => ({ kind: "text", text: value });

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
  });
});
