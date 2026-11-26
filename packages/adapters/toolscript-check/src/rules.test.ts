import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkToolScript } from "./check.ts";

/** The invented acme registry's risks. */
const risks: Record<string, "routine" | "admin" | "irreversible"> = {
  "acme.comment@1": "routine",
  "acme.get-variable@1": "routine",
  "acme.set-variable@1": "admin",
};
const riskOf = (reference: string) => risks[reference];

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}.tool.ts.txt`, import.meta.url), "utf8");
}

function messagesOf(source: string): string[] {
  const result = checkToolScript(source, { fileName: "acme.tool.ts", riskOf });
  return result.ok ? [] : result.problems.map((problem) => problem.message);
}

/** A run body inside the valid agent script, for the smaller cases. */
function withBody(body: string): string {
  return fixture("acme-comment-on-task").replace(
    '  await ctx.acme.comment({ task: ctx.input.task, body: "Done." });',
    body,
  );
}

verifies("toolscript-check.profile-rules", () => {
  it.each([
    ["p1-import", 'P1: only "import type" from "@halonicjs/toolscript" is allowed in a ToolScript'],
    ["p2-call", "P2: header is a pure literal, so a call is not allowed in it"],
    ["p3-two-parameters", "P3: run is an exported function that takes one parameter, ctx"],
    ["p4-eval", "P4: eval is not allowed in a ToolScript"],
    ["p5-fetch", "P5: fetch is not allowed in a ToolScript"],
    ["p6-complexity-16", "P6: function run has complexity 16, at most 15"],
    ["p7-any", "P7: any is not allowed in a ToolScript"],
    ["p5-shadowed-name", "P5: fetch is not allowed in a ToolScript"],
  ])("the fixture %s yields exactly its rule's message", (name, message) => {
    expect(messagesOf(fixture(name))).toEqual([message]);
  });

  it.each([
    "acme-comment-on-task",
    "acme-sync-release-variables",
    "acme-declarative",
    "p4-p5-property-names",
    "p6-complexity-15",
  ])("passes the fixture %s", (name) => {
    expect(messagesOf(fixture(name))).toEqual([]);
  });

  it("gives the rule's line and column", () => {
    const result = checkToolScript(fixture("p4-eval"), { fileName: "acme.tool.ts", riskOf });
    expect(result.ok ? [] : result.problems).toEqual([
      { rule: "P4", message: "P4: eval is not allowed in a ToolScript", line: 18, column: 3 },
    ]);
  });

  describe("P4 and P5 beyond plain names", () => {
    it.each([
      ["  const f = ctx.input.constructor;", "P4: .constructor is not allowed in a ToolScript"],
      ['  const f = ctx["__proto__"];', "P4: .__proto__ is not allowed in a ToolScript"],
      [
        "  Array.prototype.map = () => [];",
        "P4: writing to a prototype is not allowed in a ToolScript",
      ],
      [
        '  Object.defineProperty(ctx.input, "x", { get: () => 1 });',
        "P4: a getter or setter on ctx is not allowed in a ToolScript",
      ],
      ["  debugger;", "P4: debugger is not allowed in a ToolScript"],
      ["  const t = Date.now();", "P5: Date.now() is not allowed in a ToolScript"],
      [
        "  const t = new Date();",
        "P5: new Date() without arguments is not allowed in a ToolScript",
      ],
      ["  const r = Math.random();", "P5: Math.random is not allowed in a ToolScript"],
      ["  const s = crypto.subtle;", "P5: crypto.subtle is not allowed in a ToolScript"],
      ['  const m = await import("node:fs");', "P1: import() is not allowed in a ToolScript"],
      [
        "  const t = ctx.input.task!;",
        "P7: the non-null assertion ! is not allowed in a ToolScript",
      ],
      ["  // @ts-ignore\n  const t = 1;", "P7: @ts-ignore is not allowed in a ToolScript"],
    ])("refuses %s", (body, message) => {
      expect(messagesOf(withBody(body))).toEqual([message]);
    });

    it("lets a date with arguments, a type named Function and a label through", () => {
      const body = [
        "  const at = new Date(0);",
        "  const call: Function | undefined = undefined;",
        "  outer: for (const x of [at, call]) break outer;",
      ].join("\n");
      expect(messagesOf(withBody(body))).toEqual([]);
    });
  });

  describe("P2 and P3", () => {
    it("refuses a header that isn't const, and other exports", () => {
      const source = fixture("acme-comment-on-task")
        .replace("export const header", "export let header")
        .concat("\nexport const extra = 1;\n");
      expect(messagesOf(source)).toEqual([
        "P2: a ToolScript exports const header",
        "P3: a ToolScript exports only header and run, not extra",
      ]);
    });

    it("refuses a spread, a variable and an interpolated template in the header", () => {
      const source = fixture("acme-comment-on-task")
        .replace('risk: "routine",', "risk: level, ...more,")
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the script's own template, as text.
        .replace('"Posts one comment on a task."', "`Posts ${count}`");
      expect(messagesOf(source)).toEqual([
        "P2: header is a pure literal, so an interpolated template is not allowed in it",
        "P2: header is a pure literal, so a variable is not allowed in it",
        "P2: header is a pure literal, so a spread is not allowed in it",
      ]);
    });

    it("gives the header schema's reasons once the literal reads", () => {
      const source = fixture("acme-comment-on-task").replace(
        '"acme.comment@1"',
        '"acme.set-variable@1"',
      );
      expect(messagesOf(source)).toEqual([
        "header: risk: routine is lower than admin, the highest risk of what it uses",
      ]);
    });
  });

  it("refuses a file over 300 lines", () => {
    const source = `${fixture("acme-comment-on-task")}${"// filler\n".repeat(300)}`;
    expect(messagesOf(source)).toEqual([
      "P6: a ToolScript has at most 300 lines, this one has 319",
    ]);
  });

  it("reports a syntax error", () => {
    expect(messagesOf(withBody("  const x = ;"))).toEqual(["syntax: Expression expected."]);
  });
});
