import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { OpenUiLibrary } from "./library.ts";
import { OPENUI_MAX_CHARS, OPENUI_MAX_NESTING, OPENUI_MAX_ROWS } from "./limits.ts";
import { OpenUiStream, readOpenUi } from "./reader.ts";

const library: OpenUiLibrary = {
  root: "Stack",
  components: {
    Stack: [{ name: "children", type: { kind: "components" }, required: true }],
    Text: [
      { name: "text", type: { kind: "string" }, required: true },
      { name: "tone", type: { kind: "string", oneOf: ["quiet"] } },
    ],
    Button: [
      { name: "label", type: { kind: "string" }, required: true },
      { name: "action", type: { kind: "action" } },
    ],
    Table: [{ name: "columns", type: { kind: "components", maxItems: 2 }, required: true }],
    Col: [{ name: "cells", type: { kind: "list" } }],
  },
};

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

verifies("openui-lang.reader", () => {
  describe("limits", () => {
    it("gives too-large for a reply over the character limit, whole or streamed", () => {
      const text = `root = Stack([Text("${"x".repeat(OPENUI_MAX_CHARS)}")])`;
      expect(readOpenUi(text, library)).toEqual({ kind: "too-large" });
      const stream = new OpenUiStream(library);
      stream.push(text);
      expect(stream.push("more")).toEqual({ kind: "too-large" });
      expect(stream.end()).toEqual({ kind: "too-large" });
    });

    it("gives too-deep for lists nested past the limit in one statement", () => {
      const depth = OPENUI_MAX_NESTING + 1;
      expect(readOpenUi(`root = Stack(${"[".repeat(depth)}${"]".repeat(depth)})`, library)).toEqual(
        {
          kind: "too-deep",
        },
      );
    });

    it("gives too-deep for a chain of references nested past the limit", () => {
      const chain = Array.from(
        { length: OPENUI_MAX_NESTING / 2 },
        (_, index) => `s${index} = Stack([s${index + 1}])`,
      );
      expect(readOpenUi(["root = Stack([s0])", ...chain].join("\n"), library)).toEqual({
        kind: "too-deep",
      });
    });

    it("gives too-large when references repeat a statement into too many values", () => {
      const levels = Array.from(
        { length: 6 },
        (_, index) => `l${index} = Stack([${`l${index + 1}, `.repeat(8)}])`,
      );
      const text = ["root = Stack([l0])", ...levels, 'l6 = Text("x")'].join("\n");
      expect(readOpenUi(text, library)).toEqual({ kind: "too-large" });
    });

    it("gives too-large for a list over the row limit or a slot over its own limit", () => {
      const cells = Array.from({ length: OPENUI_MAX_ROWS + 1 }, () => "1").join(", ");
      expect(readOpenUi(`root = Stack([Table([Col([${cells}])])])`, library)).toEqual({
        kind: "too-large",
      });
      expect(readOpenUi("root = Stack([Table([Col(), Col(), Col()])])", library)).toEqual({
        kind: "too-large",
      });
    });
  });

  describe("display replies", () => {
    it("keeps the send-a-message and open-a-link actions, alone or in Action([...])", () => {
      const text =
        'root = Stack([Button("Ask", @ToAssistant("Hi")), Button("Docs", Action([@OpenUrl("https://example.com")]))])';
      expect(plain(readOpenUi(text, library))).toMatchObject({
        root: {
          props: {
            children: [
              { props: { action: { actions: [{ action: "ToAssistant", args: ["Hi"] }] } } },
              {
                props: {
                  action: { actions: [{ action: "OpenUrl", args: ["https://example.com"] }] },
                },
              },
            ],
          },
        },
      });
    });

    it("takes the program from an openui fence and skips an openui-js one", () => {
      const text =
        'Here:\n```openui-js\nx = 1\n```\n```openui\nroot = Stack([Text("a")])\n```\nDone, with `inline` code.';
      expect(plain(readOpenUi(text, library))).toMatchObject({
        root: { props: { children: [{ type: "Text" }] } },
      });
    });

    it("waits for the end before it checks a choice or reports a missing reference", () => {
      const stream = new OpenUiStream(library);
      const pending = stream.push('root = Stack([Text("a", "loud"), Text(later)])');
      expect(plain(pending)).toMatchObject({
        errors: [],
        root: { props: { children: [{ props: { tone: "loud" } }] } },
      });
      expect(
        plain(stream.end())
          .errors.map((error: { code: string }) => error.code)
          .sort(),
      ).toEqual(["null-required", "type-mismatch"]);
    });

    it("never lets a statement still being written replace a complete one", () => {
      const stream = new OpenUiStream(library);
      const pending = stream.push('root = Stack([t])\nt = Text("done")\nt = Text("half');
      expect(plain(pending).root.props.children).toEqual([
        { type: "Text", props: { text: "done" } },
      ]);
      expect(plain(stream.end()).root.props.children).toEqual([
        { type: "Text", props: { text: "half" } },
      ]);
    });

    it("gives parse-failed for text with no statement", () => {
      expect(readOpenUi("Just prose.", library)).toMatchObject({
        root: null,
        errors: [{ code: "parse-failed" }],
      });
    });
  });
});
